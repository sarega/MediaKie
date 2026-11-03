import type {Express} from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {ProductionLibrary, ProductionStudio} from '../src/models/assets';
import {validateStudio} from '../src/models/production';
const run = promisify(execFile);
type Dependencies = {
  projectId:(raw:unknown)=>string|null; libraryDir:(id:string)=>string; libraryUrl:(id:string,file:string)=>string;
  resolveFile:(url:string,id:string)=>string|null; lock:<T>(id:string,task:()=>Promise<T>)=>Promise<T>;
  reconcile:(id:string)=>Promise<ProductionLibrary>; write:(id:string,data:ProductionLibrary)=>Promise<void>;
};
type ExportJob = {id:string; projectId:string; status:'rendering'|'completed'|'failed'|'canceled'; progress:number; error?:string; url?:string; assetId?:string; controller:AbortController;};

export function installProductionExport(app:Express,d:Dependencies) {
  // ponytail: transient local render queue; persist jobs if resumable long renders become necessary.
  const jobs = new Map<string,ExportJob>();
  const binary = async (name:string) => process.env[`${name.toUpperCase()}_PATH`] || await fs.access(`/opt/homebrew/bin/${name}`).then(()=>`/opt/homebrew/bin/${name}`).catch(()=>name);
  const trustedFile = async (url:string,id:string) => {
    const file=d.resolveFile(url,id);const stat=file&&await fs.lstat(file).catch(()=>null);
    if(!file || path.dirname(file)!==d.libraryDir(id) || !stat?.isFile() || stat.isSymbolicLink())throw new Error('Export requires regular media files saved in this project Library');
    return file;
  };
  const snapshot = async (id:string,revision:unknown,temporary:string) => d.lock(id,async()=>{
    const data=await d.reconcile(id);
    if(revision!==data.revision)throw Object.assign(new Error('Project changed. Reload before exporting.'),{status:409});
    const studio=data.studio;if(!studio)throw new Error('Save a sequence first');validateStudio(studio,data.assets);
    if(!studio.sequence.clips.length)throw new Error('Add clips before exporting');
    if(studio.sequence.clips.reduce((sum,c)=>sum+c.end-c.start,0)>3600)throw new Error('Local export supports up to 60 minutes');
    const ids=[...new Set([...studio.sequence.clips,...studio.sequence.audio].map(c=>c.assetId))];
    const assets=data.assets.filter(a=>ids.includes(a.id));const files=new Map<string,string>();
    for(const [i,a] of assets.entries()){const source=await trustedFile(a.url,id);const target=path.join(temporary,`source-${i}${path.extname(source)}`);await fs.copyFile(source,target);files.set(a.id,target);}
    return {studio:structuredClone(studio),assets,files};
  });
  const route=(handler:(req:any,res:any,id:string)=>Promise<void>)=>async(req:any,res:any)=>{
    try{const id=d.projectId(req.params.projectId);if(!id)throw new Error('Invalid project');await handler(req,res,id);}
    catch(e:any){res.status(e.status||400).json({error:e.message||'Export failed'});}
  };
  const render = async (job:ExportJob,saved:Awaited<ReturnType<typeof snapshot>>,temporary:string) => {
    const {studio,assets,files}=saved;const q=studio.sequence;const total=q.clips.reduce((sum,c)=>sum+c.end-c.start,0);
    const size=q.resolution==='1080p'?1080:720;const [width,height]=q.ratio==='9:16'?[size,Math.round(size*16/9)]:q.ratio==='1:1'?[size,size]:[Math.round(size*16/9),size];
    const even=(n:number)=>Math.round(n/2)*2;
    const ffmpeg=await binary('ffmpeg');const ffprobe=await binary('ffprobe');const options={signal:job.controller.signal,timeout:30*60*1000,maxBuffer:2*1024*1024};
    const encode=['-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2'];
    try{
      for(const [i,c] of q.clips.entries()) {
        const asset=assets.find(a=>a.id===c.assetId)!;const file=files.get(c.assetId)!;const duration=c.end-c.start;
        const info=JSON.parse((await run(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-show_streams','-of','json',file],options)).stdout);
        const audio=asset.kind==='video'&&info.streams?.some((s:any)=>s.codec_type==='audio');
        const args=['-y','-v','error','-nostdin', ...(asset.kind==='image'?['-loop','1']:['-ss',String(c.start)]),'-protocol_whitelist','file,pipe','-i',file];
        if(!audio)args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo');
        args.push('-t',String(duration),'-vf',`scale=${even(width)}:${even(height)}:force_original_aspect_ratio=decrease,pad=${even(width)}:${even(height)}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${q.fps}`, '-af',`volume=${c.volume},apad`, '-map','0:v:0','-map',audio?'0:a:0':'1:a:0',...encode,path.join(temporary,`clip-${i}.mp4`));
        await run(ffmpeg,args,options);job.progress=Math.round((i+1)/q.clips.length*70);
      }
      await fs.writeFile(path.join(temporary,'concat.txt'),q.clips.map((c,i)=>`file 'clip-${i}.mp4'\nduration ${c.end-c.start}`).join('\n'));
      const joined=path.join(temporary,'joined.mp4');
      await run(ffmpeg,['-y','-v','error','-nostdin','-f','concat','-safe','1','-i',path.join(temporary,'concat.txt'),'-c','copy',joined],options);job.progress=80;
      const mixed=path.join(temporary,'final.mp4');const tracks=q.audio.filter(a=>!a.muted&&a.offset<total);
      if(tracks.length){
        const args=['-y','-v','error','-nostdin','-i',joined];const filters:string[]=[];
        for(const [i,a] of tracks.entries()){args.push('-ss',String(a.start),'-t',String(a.end-a.start),'-protocol_whitelist','file,pipe','-i',files.get(a.assetId)!);filters.push(`[${i+1}:a]asetpts=PTS-STARTPTS,volume=${a.volume},adelay=${Math.round(a.offset*1000)}:all=1[track${i}]`);}
        filters.push(`[0:a]${tracks.map((_,i)=>`[track${i}]`).join('')}amix=inputs=${tracks.length+1}:duration=first:normalize=0,alimiter=limit=0.95[audio]`);
        args.push('-filter_complex',filters.join(';'),'-map','0:v','-map','[audio]','-c:v','copy','-c:a','aac','-t',String(total),'-movflags','+faststart',mixed);await run(ffmpeg,args,options);
      }else await run(ffmpeg,['-y','-v','error','-nostdin','-i',joined,'-c','copy','-movflags','+faststart',mixed],options);
      job.progress=95;
      const info=JSON.parse((await run(ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',mixed],options)).stdout);
      if(!info.streams?.some((s:any)=>s.codec_type==='video') || Math.abs(Number(info.format?.duration)-total)>0.25)throw new Error('Rendered output failed duration verification');
      await d.lock(job.projectId,async()=>{
        if(job.controller.signal.aborted)throw new Error('Export canceled');
        const current=await d.reconcile(job.projectId);const filename=`sequence-${job.id}.mp4`;const destination=path.join(d.libraryDir(job.projectId),filename);
        await fs.copyFile(mixed,destination,fs.constants.COPYFILE_EXCL);
        try {
          const id=`a_${randomUUID()}`;const url=d.libraryUrl(job.projectId,filename);
          const manifestName=`sequence-${job.id}.json`;await fs.writeFile(path.join(d.libraryDir(job.projectId),manifestName),JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),studio,assets},null,2),{flag:'wx'});
          await d.write(job.projectId,{...current,revision:current.revision+1,assets:[{id,name:`Sequence ${new Date().toLocaleString()}`,kind:'video',role:'video',source:'imported',tags:['sequence-export'],url,createdAt:new Date().toISOString(),metadata:{mimeType:'video/mp4',width:even(width),height:even(height),duration:Number(info.format.duration),bytes:(await fs.stat(destination)).size},sequenceManifestUrl:d.libraryUrl(job.projectId,manifestName)} as any,...current.assets]});
          job.url=url;job.assetId=id;
        }catch(e){await fs.unlink(destination).catch(()=>{});await fs.unlink(path.join(d.libraryDir(job.projectId),`sequence-${job.id}.json`)).catch(()=>{});throw e;}
      });
      job.status='completed';job.progress=100;
    }catch(e:any){job.status=job.controller.signal.aborted?'canceled':'failed';job.error=e.code==='ENOENT'?'FFmpeg / ffprobe unavailable. Install them or configure FFMPEG_PATH and FFPROBE_PATH.':job.status==='canceled'?'Export canceled; no partial output was added.':'Local render failed. Check media decoding and FFmpeg availability; no partial output was added.';}
    finally{await fs.rm(temporary,{recursive:true,force:true});}
  };
  app.post('/api/projects/:projectId/sequence/export',route(async(req,res,id)=>{
    if([...jobs.values()].filter(j=>j.status==='rendering').length>=2 || [...jobs.values()].some(j=>j.projectId===id&&j.status==='rendering'))throw Object.assign(new Error('A local render is already running. Wait or cancel it first.'),{status:409});
    const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'studio-render-'));
    if([...jobs.values()].filter(j=>j.status==='rendering').length>=2 || [...jobs.values()].some(j=>j.projectId===id&&j.status==='rendering')){await fs.rm(temporary,{recursive:true,force:true});throw Object.assign(new Error('A render started concurrently. Try again later.'),{status:409});}
    const job:ExportJob={id:randomUUID(),projectId:id,status:'rendering',progress:0,controller:new AbortController()};jobs.set(job.id,job);
    if(jobs.size>100)for(const [key,value] of jobs){if(jobs.size<=100)break;if(value.status!=='rendering')jobs.delete(key);}
    try{const saved=await snapshot(id,req.body?.revision,temporary);res.status(202).json({id:job.id,status:job.status,progress:0});void render(job,saved,temporary);}
    catch(e){jobs.delete(job.id);await fs.rm(temporary,{recursive:true,force:true});throw e;}
  }));
  app.get('/api/projects/:projectId/sequence/export/:jobId',route(async(req,res,id)=>{const job=jobs.get(req.params.jobId);if(!job||job.projectId!==id)throw Object.assign(new Error('Render not found. After a server restart, export again.'),{status:404});const {controller,...status}=job;res.json(status);}));
  app.post('/api/projects/:projectId/sequence/export/:jobId/cancel',route(async(req,res,id)=>{const job=jobs.get(req.params.jobId);if(!job||job.projectId!==id)throw new Error('Render not found');if(job.status==='rendering')job.controller.abort();res.json({ok:true});}));
  app.post('/api/projects/:projectId/sequence/delivery',route(async(req,res,id)=>{
    const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'studio-delivery-'));const archive=path.join(temporary,'delivery.zip');
    try{
      const saved=await snapshot(id,req.body?.revision,temporary);const {studio,assets,files}=saved;const manifest:any={schemaVersion:1,projectId:id,studio,assets,files:[]};
      for(const [i,c] of studio.sequence.clips.entries()){const a=assets.find(a=>a.id===c.assetId)!;const shot=studio.shots.find(s=>s.id===c.shotId);const name=`${String(i+1).padStart(3,'0')}-${(shot?.title||a.name).replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,70)}${path.extname(files.get(a.id)!)}`;await fs.copyFile(files.get(a.id)!,path.join(temporary,name));manifest.files.push({file:name,clip:c,assetId:a.id});}
      for(const [i,c] of studio.sequence.audio.entries()){const a=assets.find(a=>a.id===c.assetId)!;const name=`audio-${i+1}${path.extname(files.get(a.id)!)}`;await fs.copyFile(files.get(a.id)!,path.join(temporary,name));manifest.files.push({file:name,audio:c,assetId:a.id});}
      await fs.writeFile(path.join(temporary,'manifest.json'),JSON.stringify(manifest,null,2));
      await run('zip',['-q',archive,'manifest.json',...manifest.files.map((f:any)=>f.file)],{cwd:temporary});
      res.download(archive,'production-delivery.zip',()=>{void fs.rm(temporary,{recursive:true,force:true});});
    }catch(e){await fs.rm(temporary,{recursive:true,force:true});throw e;}
  }));
}
