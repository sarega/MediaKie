import assert from 'node:assert/strict';
import {access, cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {request as httpRequest} from 'node:http';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'studio-library-check-'));
await cp(path.join(root, 'dist'), path.join(directory, 'dist'), {recursive: true});
const port = 34000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
let server;
let ffmpegOverride;
const start = async () => {
  server = spawn(process.execPath, [path.join(root, 'dist/server.cjs')], {cwd: directory, env: {...process.env, FFMPEG_PATH:ffmpegOverride||process.env.FFMPEG_PATH||'',NODE_ENV:'production', HOST:'127.0.0.1', PORT:String(port), KIE_API_KEY:'', HF_CREDENTIALS:'', HF_API_KEY_ID:'', HF_API_KEY_SECRET:''}, stdio:['ignore','pipe','pipe']});
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server startup failed: ${output}`)), 10000);
    const chunk = value => {output += value.toString(); if(output.includes(`Server running on ${base}`)) {clearTimeout(timeout); resolve();}};
    server.stdout.on('data', chunk); server.stderr.on('data', chunk);
    server.once('error', e => {clearTimeout(timeout); reject(e);});
    server.once('exit', code => {clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`));});
  });
};
const stop = async () => {if(server && server.exitCode === null) {const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited;}};
const request = async (route, body, method = 'POST') => {
  const response = await fetch(base + route, body === undefined ? {} : {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  return {status:response.status, body:await response.json()};
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
const makeLog = (id, urls, extra = {}) => ({id, timestamp:new Date().toISOString(), modelId:'fixture', modelName:'Fixture', provider:'fixture', prompt:'no paid calls', status:'success', type:'image', mediaUrl:urls[0], mediaUrls:urls, ...extra});

try {
  await start();
  const project = (await request('/api/projects', {name:'Production library fixture'})).body.project;
  const api = `/api/projects/${project.id}`;
  const libraryFile = path.join(directory, 'data','projects',project.id,'production.json');
  let data = (await request(api + '/production')).body;
  assert.equal(data.schemaVersion, 1); assert.equal(data.revision, 0); assert.deepEqual(data.assets, []);
  const importMedia = async (buffer, mime, revision = data.revision, name = 'reference.png') => {
    const response = await fetch(base + api + '/assets/import', {method:'POST', headers:{'Content-Type':mime, 'X-File-Name':encodeURIComponent(name),'X-Library-Revision':String(revision)}, body:buffer});
    return {status:response.status, body:await response.json()};
  };
  assert.equal((await importMedia(Buffer.from('<svg/>'),'image/svg+xml')).status, 400);
  assert.equal((await importMedia(Buffer.from('not png'),'image/png')).status, 400);
  const tooLarge = await new Promise((resolve, reject) => {
    const req = httpRequest(base + api + '/assets/import', {method:'POST',headers:{'Content-Type':'image/png','Content-Length':String(250 * 1024 * 1024 + 1)}}, res => {
      let raw=''; res.on('data', chunk => {raw += chunk;}); res.on('end', () => resolve({status:res.statusCode,body:raw}));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Timed out checking oversized upload')));
    req.on('error',reject); req.end();
  });
  assert.equal(tooLarge.status,413); assert.match(tooLarge.body,/250 MB/);
  assert.equal((await request('/api/projects/missing/production')).status, 404);
  const missingAsset = await request(api + '/assets/%2Fetc%2Fpasswd',{revision:0,name:'Bad',role:'other',tags:[]},'PATCH');
  assert.ok([400,404].includes(missingAsset.status));
  assert.equal((await request('/api/projects/bad%2Fid/production')).status,400);
  const imported = await importMedia(png,'image/png');
  assert.equal(imported.status, 200); data = imported.body;
  const reference = data.assets[0];
  assert.equal(reference.source, 'imported'); assert.equal(reference.metadata.bytes, png.length);
  assert.deepEqual(Buffer.from(await (await fetch(base + reference.url)).arrayBuffer()), png);
  assert.equal((await importMedia(png,'image/png',0)).status, 409);
  const rename = (asset, revision, name) => request(api + `/assets/${asset.id}`, {revision,name,role:'character',tags:['hero','Thai']}, 'PATCH');
  const competing = await Promise.all([rename(reference,data.revision,'Hero A'), rename(reference,data.revision,'Hero B')]);
  assert.deepEqual(competing.map(r => r.status).sort(), [200,409]);
  data = (await request(api + '/production')).body;
  assert.deepEqual(data.assets[0].tags, ['hero','Thai']);
  assert.equal((await request(api + `/assets/${reference.id}`, {revision:data.revision,name:'',role:'bad',tags:[]},'PATCH')).status,400);

  const library = path.join(directory, 'data','projects',project.id,'library');
  await writeFile(path.join(library,'a.png'),png); await writeFile(path.join(library,'b.png'),png);
  const urlA = `/projects/${project.id}/library/a.png`, urlB = `/projects/${project.id}/library/b.png`;
  const generated = makeLog('multi-output',[urlA,urlB]);
  assert.equal((await request(api + '/history/multi-output',{log:generated},'PUT')).status,200);
  data = (await request(api + '/production')).body;
  const generatedAssets = data.assets.filter(a => a.generationLogId === generated.id);
  assert.equal(generatedAssets.length,2);
  assert.equal((await request(api + '/production')).body.revision,data.revision,'Idempotent migration');
  const secondId = generatedAssets.find(a => a.url === urlB).id;
  const remove = ids => request(api + '/assets/delete-many',{revision:data.revision,assetIds:ids});
  const removedOne = await remove([generatedAssets.find(a => a.url === urlA).id]);
  assert.equal(removedOne.status,200); data = removedOne.body;
  await assert.rejects(access(path.join(library,'a.png')));
  assert.equal(data.logs.find(l => l.id === generated.id).mediaUrl,urlB);
  data = (await request(api + '/production')).body;
  assert.equal(data.assets.find(a => a.url === urlB).id,secondId,'Retained output identity must not shift');
  await writeFile(path.join(library,'c.png'),png);
  const urlC = `/projects/${project.id}/library/c.png`;
  await request(api + '/history/multi-output',{log:makeLog(generated.id,[urlB,urlC])},'PUT');
  data = (await request(api + '/production')).body;
  assert.equal(data.assets.find(a => a.id === secondId).url,urlB,'A new output must not overwrite a retained take ID');
  assert.notEqual(data.assets.find(a => a.url === urlC).id,secondId);
  const removedNew = await remove([data.assets.find(a => a.url === urlC).id]);
  assert.equal(removedNew.status,200); data = removedNew.body;
  data = (await rename(data.assets.find(a => a.id === secondId),data.revision,'Selected result')).body;
  await stop(); await start();
  data = (await request(api + '/production')).body;
  assert.equal(data.assets.find(a => a.id === secondId).name,'Selected result');

  const consumer = makeLog('consumer',[],{sourceMediaUrls:[reference.url,urlB]});
  await request(api + '/history/consumer',{log:consumer},'PUT');
  assert.equal((await remove([reference.id])).status,409);
  assert.equal((await remove([secondId])).status,409);
  assert.equal((await request(api + '/history/multi-output',{},'DELETE')).status,409);
  assert.equal((await request(api + '/history/delete-many',{logIds:['multi-output']})).status,409);
  await access(path.join(library,'b.png'));
  assert.equal((await request(api + '/history/consumer',{},'DELETE')).status,200);
  data = (await request(api + '/production')).body;
  const otherProject = (await request('/api/projects',{name:'Cross-project reference fixture'})).body.project;
  const otherApi = `/api/projects/${otherProject.id}`;
  await request(otherApi + '/history/external-consumer',{log:makeLog('external-consumer',[],{sourceMediaUrls:[reference.url,urlB]})},'PUT');
  assert.equal((await remove([reference.id])).status,409,'References in another project must retain the file');
  assert.equal((await request(api + '/history',{},'DELETE')).status,409,'Project clearing must honor cross-project references');
  await request(otherApi + '/history/external-consumer',{},'DELETE');

  const wav = Buffer.alloc(60);
  wav.write('RIFF'); wav.writeUInt32LE(52,4); wav.write('WAVE',8); wav.write('fmt ',12); wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(16,40);
  const audioResponse = await fetch(base + otherApi + '/assets/import',{method:'POST',headers:{'Content-Type':'audio/wav','X-Library-Revision':'0','X-File-Name':'voice.wav'},body:wav});
  assert.equal(audioResponse.status,200); assert.equal((await audioResponse.json()).assets[0].kind,'audio');
  try {
    await access('/opt/homebrew/bin/ffmpeg');
    const video = path.join(directory,'fixture.mp4');
    await run('/opt/homebrew/bin/ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=purple:s=160x90:d=0.5','-pix_fmt','yuv420p','-y',video]);
    const revision = (await request(otherApi + '/production')).body.revision;
    const videoResponse = await fetch(base + otherApi + '/assets/import',{method:'POST',headers:{'Content-Type':'video/mp4','X-Library-Revision':String(revision),'X-File-Name':'clip.mp4'},body:await readFile(video)});
    assert.equal(videoResponse.status,200);
    assert.equal((await videoResponse.json()).assets[0].kind,'video');
  } catch (error) {if(error.code !== 'ENOENT') throw error; console.log('Synthetic video import skipped: ffmpeg unavailable.');}

  const archiveResponse = await fetch(base + api + '/export');
  assert.equal(archiveResponse.status,200);
  const archive = path.join(directory,'backup.zip');
  await writeFile(archive,Buffer.from(await archiveResponse.arrayBuffer()));
  const listing = (await run('unzip',['-Z1',archive])).stdout;
  assert.match(listing,/production.json/); assert.match(listing,/history.json/);
  assert.ok(listing.includes(reference.url.split('/').pop())); assert.match(listing,/library\/b.png/);
  const selection = await fetch(base + api + '/assets/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetIds:[reference.id,secondId]})});
  assert.equal(selection.status,200);
  const selectionZip = path.join(directory,'selection.zip');
  await writeFile(selectionZip,Buffer.from(await selection.arrayBuffer()));
  assert.match((await run('unzip',['-Z1',selectionZip])).stdout,/assets.json/);
  assert.equal((await request(api + '/history',{},'DELETE')).status,200);
  data = (await request(api + '/production')).body;
  assert.equal(data.assets.length,1,'Clear generation history retains imported assets');
  assert.equal(data.assets[0].id,reference.id);
  assert.equal((await remove([reference.id])).status,200);
  await assert.rejects(access(path.join(library,reference.url.split('/').pop())));

  const storyboard=(await importMedia(png,'image/png',(await request(api+'/production')).body.revision,'Storyboard.png')).body.assets[0];
  data=(await request(api+'/production')).body;
  const studio={brief:'Fixture short film',look:'Natural light',defaultReferenceAssetIds:[],scenes:[{id:'scene-a',title:'Arrival',notes:''},{id:'scene-b',title:'Encounter',notes:''}],shots:Array.from({length:8},(_,i)=>({id:`shot-${i}`,sceneId:i<4?'scene-a':'scene-b',title:`Shot ${i+1}`,action:'A traveler walks',camera:'Wide shot',lighting:'Natural',dialogue:'',duration:2,referenceAssetIds:[],storyboardAssetId:i===0?storyboard.id:undefined,approvedAssetId:i===0?storyboard.id:undefined,modelId:'minimax-h3/text-to-video',category:'text-to-video',settings:{duration:6,resolution:'768P'}})),sequence:{clips:[],audio:[],ratio:'16:9',resolution:'720p',fps:24}};
  const studioSave=()=>request(api+'/studio',{revision:data.revision,studio},'PUT');
  const saved=await studioSave();assert.equal(saved.status,200);data=saved.body;
  assert.equal((await request(api+'/studio',{revision:0,studio},'PUT')).status,409);
  assert.equal((await request(api+'/studio',{revision:data.revision,studio:{...studio,shots:[{...studio.shots[0],sceneId:'missing'}]}},'PUT')).status,400);
  assert.equal((await remove([storyboard.id])).status,409,'Storyboard and approval protect media');
  await stop();await start();data=(await request(api+'/production')).body;assert.equal(data.studio.shots.length,8);assert.equal(data.studio.shots[0].approvedAssetId,storyboard.id);
  const lateLog=makeLog('late-take',[storyboard.url],{productionShotId:'shot-0'});
  await request(api+'/history/late-take',{log:lateLog},'PUT');data=(await request(api+'/production')).body;
  assert.equal(data.studio.shots[0].approvedAssetId,storyboard.id,'New take never replaces approval');
  studio.shots[0].approvedAssetId=data.assets.find(a=>a.generationLogId==='late-take').id;
  data=(await studioSave()).body;
  assert.equal((await request(api+'/history/late-take',{},'DELETE')).status,409,'Legacy single deletion protects approved generated takes');
  assert.equal((await request(api+'/history/delete-many',{logIds:['late-take']})).status,409,'Legacy bulk deletion protects approved takes');
  assert.equal((await request(api+'/history',{},'DELETE')).status,409,'Clear history protects approved takes');
  studio.shots[0].approvedAssetId=storyboard.id;data=(await studioSave()).body;
  const exportedBackup=await fetch(base+api+'/export');assert.equal(exportedBackup.status,200);
  const backupFile=path.join(directory,'studio-backup.zip');await writeFile(backupFile,Buffer.from(await exportedBackup.arrayBuffer()));
  assert.match((await run('unzip',['-p',backupFile,'production.json'])).stdout,/shot-7/);

  try {
    await access('/opt/homebrew/bin/ffmpeg');
    const videoFile=path.join(directory,'render-fixture.mp4');const blueFile=path.join(directory,'blue-fixture.mp4');const audioFile=path.join(directory,'voice-fixture.wav');
    await run('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-f','lavfi','-i','color=red:s=160x90:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac','-shortest',videoFile]);
    await run('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=880:duration=2',audioFile]);
    await run('/opt/homebrew/bin/ffmpeg',['-y','-v','error','-f','lavfi','-i','color=blue:s=160x90:d=2','-c:v','libx264',blueFile]);
    data=(await importMedia(await readFile(videoFile),'video/mp4',data.revision,'Red take.mp4')).body;const video=data.assets[0];
    data=(await importMedia(await readFile(audioFile),'audio/wav',data.revision,'Narration.wav')).body;const audio=data.assets[0];
    data=(await importMedia(await readFile(blueFile),'video/mp4',data.revision,'Blue take.mp4')).body;const blue=data.assets[0];
    studio.sequence.clips=[{id:'clip1',assetId:video.id,start:0,end:1,volume:0.5,shotId:'shot-0'},{id:'clip2',assetId:blue.id,start:1,end:2,volume:0.5,shotId:'shot-1'}];
    studio.sequence.audio=[{id:'audio1',assetId:audio.id,start:0,end:1,offset:0.5,volume:0.25,muted:false}];
    data=(await studioSave()).body;assert.equal((await remove([video.id])).status,409,'Saved sequence protects source media');
    const render=await request(api+'/sequence/export',{revision:data.revision});assert.equal(render.status,202);
    let rendered;
    for(let i=0;i<300;i++){rendered=(await request(api+`/sequence/export/${render.body.id}`)).body;if(rendered.status!=='rendering')break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(rendered.status,'completed',JSON.stringify(rendered));assert.equal(rendered.progress,100);
    const output=path.join(directory,'exported.mp4');await writeFile(output,Buffer.from(await (await fetch(base+rendered.url)).arrayBuffer()));
    const probe=JSON.parse((await run('/opt/homebrew/bin/ffprobe',['-v','error','-show_streams','-show_format','-of','json',output])).stdout);
    assert.ok(Math.abs(Number(probe.format.duration)-2)<0.25);assert.equal(probe.streams.find(s=>s.codec_type==='video').width,1280);assert.ok(probe.streams.some(s=>s.codec_type==='audio'));
    const pixel=async at=>(await run('/opt/homebrew/bin/ffmpeg',['-v','error','-ss',String(at),'-i',output,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer'})).stdout;
    const first=await pixel(0.25),second=await pixel(1.25);assert.ok(first[0]>first[2]*2,'First clip is red');assert.ok(second[2]>second[0]*2,'Second clip is blue');
    const rms=async at=>{const {stdout}=await run('/opt/homebrew/bin/ffmpeg',['-v','error','-ss',String(at),'-i',output,'-t','0.15','-vn','-af','bandpass=f=880:t=h:w=80','-ac','1','-ar','48000','-f','f32le','pipe:1'],{encoding:'buffer'});let energy=0;for(let i=0;i+4<=stdout.length;i+=4)energy+=stdout.readFloatLE(i)**2;return Math.sqrt(energy/(stdout.length/4));};
    assert.ok(await rms(0.75)>await rms(0.15)*3,'Voice track begins after configured 0.5 second offset');
    data=(await request(api+'/production')).body;assert.ok(data.assets.some(a=>a.id===rendered.assetId));
    const delivery=await fetch(base+api+'/sequence/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:data.revision})});assert.equal(delivery.status,200);
    const deliveryFile=path.join(directory,'delivery.zip');await writeFile(deliveryFile,Buffer.from(await delivery.arrayBuffer()));
    const manifest=JSON.parse((await run('unzip',['-p',deliveryFile,'manifest.json'])).stdout);assert.equal(manifest.files.length,3);assert.equal(manifest.studio.sequence.audio[0].offset,0.5);
    const canceled=await request(api+'/sequence/export',{revision:data.revision});assert.equal(canceled.status,202);
    await request(api+`/sequence/export/${canceled.body.id}/cancel`,{});
    for(let i=0;i<100;i++){const j=(await request(api+`/sequence/export/${canceled.body.id}`)).body;if(j.status!=='rendering'){assert.equal(j.status,'canceled');break;}await new Promise(r=>setTimeout(r,50));}
    ffmpegOverride=path.join(directory,'missing-ffmpeg');await stop();await start();
    const missing=await request(api+'/sequence/export',{revision:data.revision});assert.equal(missing.status,202);
    for(let i=0;i<100;i++){const j=(await request(api+`/sequence/export/${missing.body.id}`)).body;if(j.status!=='rendering'){assert.equal(j.status,'failed');assert.match(j.error,/unavailable/);break;}await new Promise(r=>setTimeout(r,50));}
    assert.equal((await request(api+'/production')).body.assets.length,data.assets.length,'No partial output after failed render');
    ffmpegOverride=undefined;await stop();await start();assert.equal((await request(api+`/sequence/export/${missing.body.id}`)).status,404,'Render tracking explicitly does not survive restart');
    console.log('Studio: 2 scenes / 8 shots, restart, approvals, deletion guards, saved edits, real MP4/audio render, delivery manifest and cancellation passed.');
  }catch(e){if(e.code==='ENOENT')console.log('Studio render skipped: FFmpeg unavailable');else throw e;}

  const before = await readFile(libraryFile,'utf8');
  await writeFile(libraryFile,'{broken');
  assert.equal((await request(api + '/production')).status,500);
  assert.equal((await request(api + '/history',{},'DELETE')).status,500);
  assert.equal(await readFile(libraryFile,'utf8'),'{broken','Corrupt metadata must never be replaced with an empty library');
  await writeFile(libraryFile,before);
  assert.equal((await request(api + '/production')).status,200);
  if (process.argv.includes('--preview')) {
    data = (await importMedia(png,'image/png',(await request(api + '/production')).body.revision,'Hero reference.png')).body;
    console.log(`Preview fixture: ${base} (project ${project.id}); upload fixture: ${path.join(library,data.assets[0].url.split('/').pop())}; Ctrl-C to stop.`);
    await new Promise(resolve => process.once('SIGINT',resolve));
  }
  console.log('Production library: import validation, migration, independent outputs, optimistic conflicts, restart, references, deletion and ZIP backups passed (isolated fixtures; no paid calls).');
} finally {await stop(); await rm(directory,{recursive:true,force:true});}
