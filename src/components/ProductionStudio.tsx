import React, {useEffect, useRef, useState} from 'react';
import {emptyStudio, type ProductionLibrary, type ProductionShot, type ProductionStudio as StudioData} from '../models/assets';
import {MODEL_REGISTRY, defaultsFor, estimateCost} from '../models/registry';
import {shotRequest,batchEstimate} from '../models/production';
import {jsonRequest} from '../generation/client';
import type {GenerationLog} from '../types';
import {MediaThumbnail} from './MediaThumbnail';

const field = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm';
const button = 'rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40';
type Props = {projectId:string; logs:GenerationLog[]; onGenerate:(prompt:string, image?:string, video?:string, params?:Record<string,any>) => Promise<void>};

export function ProductionStudio({projectId,logs,onGenerate}:Props) {
  const [data,setData] = useState<ProductionLibrary>();
  const [studio,setStudio] = useState<StudioData>(emptyStudio);
  const [tab,setTab] = useState('Board');
  const [selected,setSelected] = useState('');
  const [checked,setChecked] = useState<string[]>([]);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [dirty,setDirty] = useState(false);
  const [status,setStatus] = useState('');
  const [exportJob,setExportJob] = useState<any>(()=>{try{return JSON.parse(sessionStorage.getItem(`mediakie-render:${projectId}`)||'null');}catch{return null;}});
  const dirtyRef = useRef(false);
  const alive = useRef(true);
  const running = useRef(false);
  const loadCounter = useRef(0);
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const draftKey = `mediakie-studio-draft:${projectId}`;
  const request = async (route:string, body?:unknown) => {
    const res = await fetch(base + route,body === undefined ? undefined : {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Studio request failed'); return result;
  };
  const load = async () => {
    const token = ++loadCounter.current;
    try {const next = await request('/production'); if(alive.current && token === loadCounter.current){
      let draft:any;try{draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');}catch{}
      setData(draft?.studio?{...next,revision:draft.revision}:next);setStudio(draft?.studio||next.studio||emptyStudio());setDirty(!!draft?.studio);
      setError(draft?.studio&&draft.revision!==next.revision?'Restored unsaved draft; project changed. Copy your edits before reloading.':'');setStatus(draft?.studio?'Unsaved draft restored':'');
    }}
    catch(e:any){if(alive.current && token === loadCounter.current)setError(e.message);}
  };
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]);
  const logSignature=JSON.stringify(logs.map(l=>[l.id,l.status,l.mediaUrl,l.mediaUrls]));
  useEffect(()=>{if(!data || running.current)return;const token=++loadCounter.current;void request('/production').then(next=>{if(!alive.current || token!==loadCounter.current)return;if(dirtyRef.current){if(next.revision!==data.revision)setError('Library changed while editing. Save may conflict; copy your edits before reloading.');}else{setData(next);setStudio(next.studio||emptyStudio());}}).catch(e=>{if(alive.current && token===loadCounter.current)setError(e.message);});},[logSignature]);
  useEffect(()=>{dirtyRef.current=dirty;if(dirty&&data){try{sessionStorage.setItem(draftKey,JSON.stringify({revision:data.revision,studio}));}catch{setError('Browser draft storage unavailable. Save before navigating away.');}}},[dirty,studio,data?.revision]);
  useEffect(()=>{try{if(exportJob)sessionStorage.setItem(`mediakie-render:${projectId}`,JSON.stringify(exportJob));}catch{}},[exportJob]);
  useEffect(()=>{
    if(exportJob?.status!=='rendering')return;
    let active=true;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const res=await fetch(`${base}/sequence/export/${exportJob.id}`);
        const next=await res.json();if(!res.ok)throw new Error(next.error);
        const current=next.status==='completed'?await request('/production'):null;
        if(!active)return;
        if(current){if(!dirtyRef.current)setData(current);else setError('Export completed while editing. Save may conflict; retain your edits before reloading.');setStatus('MP4 saved in Library');}
        setExportJob(next);
        if(next.status==='rendering')timer=setTimeout(poll,1000);
        else if(next.status!=='completed')setError(next.error||'Export stopped');
      }catch(e:any){if(active){setError(e.message);setExportJob({...exportJob,status:'failed'});}}
    };
    timer=setTimeout(poll,1000);return()=>{active=false;clearTimeout(timer);};
  },[exportJob?.id,exportJob?.status]);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  const change = (next:StudioData) => {dirtyRef.current=true;setStudio(next);setDirty(true);setStatus('Unsaved changes');};
  const save = async () => {
    if(!data)throw new Error('Load a project first');
    const next = await request('/studio',{revision:data.revision,studio});
    if(alive.current){setData(next);setDirty(false);dirtyRef.current=false;sessionStorage.removeItem(draftKey);setStatus('Saved');} return next as ProductionLibrary;
  };
  const act = async (task:()=>Promise<unknown>) => {
    if(running.current)return;running.current=true;++loadCounter.current;setBusy(true);setError('');
    try{await task();}catch(e:any){if(alive.current)setError(e.message);}finally{running.current=false;if(alive.current)setBusy(false);}
  };
  const exportSequence = async (delivery=false) => {
    const saved=await save();
    const response=await fetch(base+(delivery?'/sequence/delivery':'/sequence/export'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:saved.revision})});
    if(!response.ok){const body=await response.json();throw new Error(body.error||'Export failed');}
    if(delivery){const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='production-delivery.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setStatus('Delivery ZIP downloaded');}
    else setExportJob(await response.json());
  };
  const assets = data?.assets || [];
  const orderedShots = studio.scenes.flatMap(scene=>studio.shots.filter(s=>s.sceneId===scene.id));
  const shot = studio.shots.find(s=>s.id===selected);
  const updateShot = (patch:Partial<ProductionShot>) => shot && change({...studio,shots:studio.shots.map(s=>s.id===shot.id?{...s,...patch}:s)});
  const models = MODEL_REGISTRY.filter(m=>!m.unavailableReason && ['text-to-image','image-to-image','text-to-video','image-to-video','video-to-video'].includes(m.category));
  const model = shot && models.find(m=>m.id===shot.modelId && m.category===shot.category);
  const addScene = () => change({...studio,scenes:[...studio.scenes,{id:crypto.randomUUID(),title:`Scene ${studio.scenes.length+1}`,notes:''}]});
  const addShot = (sceneId:string) => {
    const m=models.find(m=>m.id==='minimax-h3/text-to-video') || models[0];
    const s:ProductionShot={id:crypto.randomUUID(),sceneId,title:`Shot ${studio.shots.filter(s=>s.sceneId===sceneId).length+1}`,action:'',camera:'',lighting:'',dialogue:'',duration:6,referenceAssetIds:[],modelId:m.id,category:m.category,settings:{...defaultsFor(m),duration:6}};
    change({...studio,shots:[...studio.shots,s]});setSelected(s.id);
  };
  const move = <T extends {id:string;sceneId?:string}>(list:T[],id:string,delta:number) => {const next=[...list];const index=next.findIndex(v=>v.id===id);if(index<0)return next;const siblings=next.map((v,i)=>({v,i})).filter(({v})=>!next[index].sceneId||v.sceneId===next[index].sceneId);const position=siblings.findIndex(({i})=>i===index);const target=siblings[position+delta]?.i;if(target!==undefined)[next[index],next[target]]=[next[target],next[index]];return next;};
  const state = (s:ProductionShot) => s.approvedAssetId?'Approved':logs.some(l=>l.productionShotId===s.id&&l.status==='generating')?'Generating':logs.some(l=>l.productionShotId===s.id&&l.status==='success')?'Needs review':s.action.trim()?'Ready':'Draft';
  const generate = async (ids:string[]) => {
    const targets=orderedShots.filter(s=>ids.includes(s.id));
    if(!targets.length)throw new Error('Select shots to generate');
    const requests=targets.map(s=>({shot:s,...shotRequest(studio,s,assets)}));
    const plans=await Promise.all(requests.map(async p=>({...p,...await jsonRequest('/api/generation/estimate',{logicalModel:p.model.logicalId,input:p.input,sourceType:p.sourceType,sourceDuration:p.sourceDuration})})));
    if(!alive.current)return;
    const summary=batchEstimate(plans);
    if(!window.confirm(`Generate ${plans.length} shot(s)?\n${summary}\nExisting approved takes remain unchanged. This may spend provider credits.`))return;
    await save();
    for(const p of plans){if(!alive.current)break;await onGenerate(p.input.prompt,p.input.__sourceImage,p.input.__sourceVideo,{...p.input,__studioModel:p.model.logicalId,__studioShotId:p.shot.id,__sourceDuration:p.sourceDuration,__sourceType:p.sourceType,__policy:'manual',__provider:p.provider});}
    if(alive.current){setStatus('Submitted. Review results in Takes / Activity.');const next=await request('/production');setData(next);}
  };
  const addApproved = () => {
    if(orderedShots.some(s=>s.approvedAssetId&&!assets.some(a=>a.id===s.approvedAssetId))){setError('An approved take is unavailable. Reassign it before adding clips.');return;}
    const clips=orderedShots.filter(s=>s.approvedAssetId).map(s=>{const a=assets.find(a=>a.id===s.approvedAssetId)!;return{id:crypto.randomUUID(),assetId:a.id,shotId:s.id,start:0,end:a.metadata.duration || s.duration,volume:1};});
    if(!clips.length){setError('Approve image or video takes first');return;}
    if(!window.confirm('Append approved takes to the saved sequence? Later approvals will not change these clips.'))return;
    change({...studio,sequence:{...studio.sequence,clips:[...studio.sequence.clips,...clips]}});
  };
  let preview:any;let previewError='';
  if(shot){try{const p=shotRequest(studio,shot,assets);preview={model:p.model.logicalId,input:p.input,sourceDuration:p.sourceDuration,sourceType:p.sourceType};}catch(e:any){previewError=e.message;}}
  const referencePicker = (selectedIds:string[],onChange:(ids:string[])=>void) => <div className="max-h-44 overflow-y-auto space-y-2 rounded-lg border border-neutral-800 p-3">{assets.map(a=><label key={a.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selectedIds.includes(a.id)} onChange={e=>onChange(e.target.checked?[...selectedIds,a.id]:selectedIds.filter(id=>id!==a.id))}/><span>{a.name} <span className="text-neutral-500">{a.kind} · {a.role}</span></span></label>)}{!assets.length&&<p className="text-sm text-neutral-500">Import references in Library first.</p>}</div>;
  return <section className="flex min-h-0 flex-col gap-4">
    <header className="flex flex-wrap items-center gap-2"><h2 className="mr-auto text-lg">Production studio</h2><span className="text-xs text-neutral-400" role="status">{status}</span><button className={button} disabled={busy||!data} onClick={()=>void act(save)}>Save project</button><button className={button} disabled={busy} onClick={()=>{if(!dirty||window.confirm('Discard unsaved studio edits and reload?')){sessionStorage.removeItem(draftKey);void load();}}}>Reload</button></header>
    <nav className="flex gap-2" aria-label="Project workspace">{['Overview','Board','Edit'].map(t=><button key={t} className={`${button} ${tab===t?'bg-violet-500/20 text-violet-200':''}`} onClick={()=>setTab(t)}>{t}</button>)}</nav>
    {error&&<p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-300">{error}</p>}
    {tab==='Edit'&&<div className="flex flex-wrap items-center gap-2"><button className={button} disabled={busy||!data||exportJob?.status==='rendering'} onClick={()=>void act(()=>exportSequence())}>Export MP4 + audio</button><button className={button} disabled={busy||!data} onClick={()=>void act(()=>exportSequence(true))}>Delivery ZIP</button>{exportJob&&<span className="text-sm" role="status">{exportJob.status} · {exportJob.progress}%</span>}{exportJob?.status==='rendering'&&<button className={button} onClick={()=>void act(async()=>{const res=await fetch(`${base}/sequence/export/${exportJob.id}/cancel`,{method:'POST'});if(!res.ok)throw new Error('Cancel failed');})}>Cancel render</button>}{exportJob?.url&&<a href={exportJob.url} download className="text-sm text-violet-300">Download MP4</a>}</div>}
    {!data?<p>Loading studio…</p>:<fieldset disabled={busy} className="min-w-0 space-y-4">
    {tab==='Overview'&&<><label className="block">Project brief<textarea className={field} rows={4} value={studio.brief} onChange={e=>change({...studio,brief:e.target.value})}/></label><label className="block">Visual direction<textarea className={field} rows={3} value={studio.look} onChange={e=>change({...studio,look:e.target.value})}/></label><h3>Default references</h3>{referencePicker(studio.defaultReferenceAssetIds,ids=>change({...studio,defaultReferenceAssetIds:ids}))}</>}
    {tab==='Board'&&<><div className="flex flex-wrap gap-2"><button className={button} onClick={addScene}>+ Scene</button><button className={button} onClick={()=>void act(()=>generate(checked))}>Generate selected ({checked.length})</button><button className={button} onClick={()=>void act(()=>generate(studio.shots.filter(s=>!s.approvedAssetId&&!logs.some(l=>l.productionShotId===s.id&&['generating','success'].includes(l.status))).map(s=>s.id)))}>Generate missing takes</button></div><div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="space-y-6">{studio.scenes.map(scene=><section key={scene.id} className="rounded-xl border border-neutral-800 p-4"><div className="flex flex-wrap gap-2"><input aria-label="Scene title" className={`${field} flex-1 min-w-32`} value={scene.title} onChange={e=>change({...studio,scenes:studio.scenes.map(s=>s.id===scene.id?{...s,title:e.target.value}:s)})}/><button className={button} onClick={()=>change({...studio,scenes:move(studio.scenes,scene.id,-1)})} aria-label="Move scene up">↑</button><button className={button} onClick={()=>change({...studio,scenes:move(studio.scenes,scene.id,1)})} aria-label="Move scene down">↓</button><button className={button} onClick={()=>addShot(scene.id)}>+ Shot</button><button className={button} onClick={()=>{if(window.confirm('Remove scene and its shots? Media and saved timeline clips are retained.'))change({...studio,scenes:studio.scenes.filter(s=>s.id!==scene.id),shots:studio.shots.filter(s=>s.sceneId!==scene.id)});}}>Remove</button></div><textarea aria-label="Scene notes" className={`${field} mt-2`} rows={1} placeholder="Scene notes" value={scene.notes} onChange={e=>change({...studio,scenes:studio.scenes.map(s=>s.id===scene.id?{...s,notes:e.target.value}:s)})}/><div className="mt-4 grid gap-3 sm:grid-cols-2">{studio.shots.filter(s=>s.sceneId===scene.id).map(s=>{const a=assets.find(a=>a.id===(s.approvedAssetId||s.storyboardAssetId));return<article key={s.id} className={`rounded-lg border p-3 ${selected===s.id?'border-violet-500':'border-neutral-700'}`}><div className="flex items-center gap-2"><input aria-label={`Select ${s.title}`} type="checkbox" checked={checked.includes(s.id)} onChange={e=>setChecked(e.target.checked?[...checked,s.id]:checked.filter(id=>id!==s.id))}/><button className="flex-1 text-left" onClick={()=>setSelected(s.id)}>{s.title}</button><span className="text-xs text-violet-300">{state(s)}</span></div><button className="mt-2 block w-full text-left" onClick={()=>setSelected(s.id)}>{a?<MediaThumbnail alt={a.name} url={a.url} type={a.kind} className="aspect-video w-full rounded object-cover"/>:<div className="flex aspect-video items-center justify-center rounded bg-neutral-900 text-sm text-neutral-500">Storyboard</div>}<p className="mt-2 truncate text-sm text-neutral-400">{s.action||'Add shot direction'}</p></button><div className="mt-2 flex gap-2"><button className={button} aria-label={`Move ${s.title} up`} onClick={()=>change({...studio,shots:move(studio.shots,s.id,-1)})}>↑</button><button className={button} aria-label={`Move ${s.title} down`} onClick={()=>change({...studio,shots:move(studio.shots,s.id,1)})}>↓</button></div></article>;})}</div></section>)}{!studio.scenes.length&&<p className="text-neutral-400">Create a scene, then add shots. Library originals remain separate from Board edits.</p>}</div>
    {shot&&<aside className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"><label className="block text-sm">Shot title<input className={field} value={shot.title} onChange={e=>updateShot({title:e.target.value})}/></label>{(['action','camera','lighting','dialogue'] as const).map(key=><label className="block text-sm capitalize" key={key}>{key}<textarea rows={key==='action'?3:2} className={field} value={shot[key]} onChange={e=>updateShot({[key]:e.target.value})}/></label>)}<label className="block text-sm">Camera preset (prompt only)<select className={field} value="" onChange={e=>updateShot({camera:e.target.value})}><option value="">Choose preset…</option>{['Wide establishing shot, static camera','Close-up, shallow depth of field','Slow dolly in','Tracking shot','Over-the-shoulder shot'].map(v=><option key={v}>{v}</option>)}</select></label><label className="block text-sm">Model<select className={field} value={model?.logicalId||''} onChange={e=>{const m=models.find(m=>m.logicalId===e.target.value)!;updateShot({modelId:m.id,category:m.category,settings:defaultsFor(m)});}}>{models.map(m=><option key={m.logicalId} value={m.logicalId}>{m.name} · {m.category}</option>)}</select></label>
    <details open><summary className="cursor-pointer text-sm">Parameters</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{model?.params?.filter(p=>p.type!=='file').map(p=><label className="text-xs" key={p.key}>{p.name}{p.options?<select className={field} multiple={p.multiple} value={p.multiple?(Array.isArray(shot.settings[p.key])?shot.settings[p.key] as string[]:[]):String(shot.settings[p.key]??p.defaultValue??'')} onChange={e=>updateShot({settings:{...shot.settings,[p.key]:p.multiple?Array.from(e.target.selectedOptions,(o:HTMLOptionElement)=>p.options!.find(v=>String(v.value)===o.value)!.value):p.options!.find(o=>String(o.value)===e.target.value)!.value}})}>{p.options.map(o=><option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}</select>:p.type==='boolean'?<input className="ml-2" type="checkbox" checked={Boolean(shot.settings[p.key]??p.defaultValue)} onChange={e=>updateShot({settings:{...shot.settings,[p.key]:e.target.checked}})}/>:<input className={field} type={['number','slider'].includes(p.type)?'number':'text'} min={p.min} max={p.max} step={p.step} value={String(shot.settings[p.key]??p.defaultValue??'')} onChange={e=>updateShot({settings:{...shot.settings,[p.key]:['number','slider'].includes(p.type)&&e.target.value!==''?Number(e.target.value):e.target.value}})}/>}</label>)}</div></details>
    <details><summary className="cursor-pointer text-sm">References</summary><label className="block text-xs py-2"><input type="checkbox" checked={shot.inheritReferences!==false} onChange={e=>updateShot({inheritReferences:e.target.checked})}/> Use project references</label>{referencePicker(shot.referenceAssetIds,ids=>updateShot({referenceAssetIds:ids}))}<label className="block text-sm">Storyboard<select className={field} value={shot.storyboardAssetId||''} onChange={e=>updateShot({storyboardAssetId:e.target.value||undefined})}><option value="">None</option>{assets.filter(a=>a.kind==='image').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></details>
    <details><summary className="cursor-pointer text-sm">Request JSON</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-neutral-400">{previewError||JSON.stringify(preview,null,2)}</pre><p className="text-xs text-neutral-500">Local references are uploaded before submission. The saved take keeps final provider settings.</p></details>
    {previewError&&<p className="text-xs text-amber-300">{previewError}</p>}<button className={`${button} w-full bg-violet-600`} disabled={!!previewError} onClick={()=>void act(()=>generate([shot.id]))}>Generate take · {preview?(()=>{const c=estimateCost(model!,model!.mappings[0].provider,preview.input,preview.sourceType,preview.sourceDuration);return c.credits?`${c.credits} cr`:c.usd!==null?`~$${c.usd.toFixed(3)}`:'Price unknown';})():'Unavailable'}</button>
    <details open><summary>Takes</summary><div className="mt-2 space-y-3">{assets.filter(a=>a.generationLogId&&logs.some(l=>l.id===a.generationLogId&&l.productionShotId===shot.id)).map(a=><article key={a.id} className="rounded border border-neutral-700 p-2">{a.kind==='image'?<img alt={a.name} src={a.url} className="max-h-36 w-full object-contain"/>:a.kind==='video'?<video src={a.url} controls className="max-h-40 w-full"/>:<audio src={a.url} controls/>}<p className="text-xs">{a.name}</p><label className="block text-xs">Take notes<textarea className={field} rows={2} value={shot.takeNotes?.[a.id]||""} onChange={e=>updateShot({takeNotes:Object.fromEntries(Object.entries({...shot.takeNotes,[a.id]:String(e.target.value)}).filter(([,v])=>v)) as Record<string,string>})}/></label><details><summary className="text-xs">Prompt / settings</summary><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(logs.find(l=>l.id===a.generationLogId)?.settingsSnapshot,null,2)}</pre></details><button className={button} onClick={()=>updateShot({approvedAssetId:a.id})}>{shot.approvedAssetId===a.id?'Approved':'Approve take'}</button></article>)}{logs.filter(l=>l.productionShotId===shot.id&&l.status!=='success').map(l=><p className="text-xs" key={l.id}>{l.status}: {l.error||l.modelName}</p>)}<label className="block text-xs">Assign existing library take<select className={field} value={shot.approvedAssetId||''} onChange={e=>updateShot({approvedAssetId:e.target.value||undefined})}><option value="">Not approved</option>{assets.filter(a=>a.kind!=='audio').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div></details><button className={button} onClick={()=>{if(window.confirm('Remove this shot? Takes and saved sequence clips remain in Library.')){change({...studio,shots:studio.shots.filter(s=>s.id!==shot.id)});setSelected('');}}}>Remove shot</button></aside>}
    </div></>}
    {tab==='Edit'&&<><div className="flex flex-wrap gap-2"><button className={button} onClick={addApproved}>Append approved takes</button><span className="self-center text-sm text-neutral-400">{studio.sequence.clips.reduce((sum,c)=>sum+c.end-c.start,0).toFixed(2)} s · Save before export</span></div><div className="flex flex-wrap gap-3">{(['ratio','resolution','fps'] as const).map(k=><label key={k} className="text-sm capitalize">{k}<select className={field} value={studio.sequence[k]} onChange={e=>change({...studio,sequence:{...studio.sequence,[k]:k==='fps'?Number(e.target.value):e.target.value}})}>{(k==='ratio'?['16:9','9:16','1:1']:k==='resolution'?['720p','1080p']:[24,25,30]).map(v=><option key={v}>{v}</option>)}</select></label>)}</div>{studio.sequence.clips.map(c=>{const a=assets.find(a=>a.id===c.assetId);const patch=(v:any)=>change({...studio,sequence:{...studio.sequence,clips:studio.sequence.clips.map(x=>x.id===c.id?{...x,...v}:x)}});return<article key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-700 p-3"><>{a&&<MediaThumbnail alt={a.name} url={a.url} type={a.kind} className="h-20 w-28 object-cover"/>}<span className="flex-1 text-sm">{a?.name||'Unavailable asset — remove or reassign this clip'}</span></>{(['start','end','volume'] as const).map(k=><label className="text-xs" key={k}>{k}<input className={`${field} max-w-24`} type="number" min={0} step="0.1" value={c[k]} onChange={e=>patch({[k]:Number(e.target.value)})}/></label>)}<button className={button} onClick={()=>change({...studio,sequence:{...studio.sequence,clips:move(studio.sequence.clips,c.id,-1)}})} aria-label="Move clip up">↑</button><button className={button} onClick={()=>change({...studio,sequence:{...studio.sequence,clips:move(studio.sequence.clips,c.id,1)}})} aria-label="Move clip down">↓</button><button className={button} onClick={()=>{const at=Number(window.prompt('Split at source time (seconds)',String((c.start+c.end)/2)));if(at>c.start&&at<c.end)change({...studio,sequence:{...studio.sequence,clips:studio.sequence.clips.flatMap(x=>x.id===c.id?[{...x,end:at},{...x,id:crypto.randomUUID(),start:at}]:[x])}});}}>Split</button><button className={button} onClick={()=>change({...studio,sequence:{...studio.sequence,clips:studio.sequence.clips.filter(x=>x.id!==c.id)}})}>Remove</button></article>;})}
    <label className="block text-sm">Add library clip<select className={field} value="" onChange={e=>{const a=assets.find(a=>a.id===e.target.value)!;change({...studio,sequence:{...studio.sequence,clips:[...studio.sequence.clips,{id:crypto.randomUUID(),assetId:a.id,start:0,end:a.metadata.duration||5,volume:1}]}});}}><option value="">Choose image / video…</option>{assets.filter(a=>a.kind!=='audio').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="block text-sm">Voice / music<select className={field} value="" onChange={e=>{const a=assets.find(a=>a.id===e.target.value)!;change({...studio,sequence:{...studio.sequence,audio:[...studio.sequence.audio,{id:crypto.randomUUID(),assetId:a.id,start:0,end:a.metadata.duration||5,offset:0,volume:1,muted:false}]}});}}><option value="">Choose audio…</option>{assets.filter(a=>a.kind==='audio').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{studio.sequence.audio.map(c=><article key={c.id} className="flex flex-wrap gap-3 rounded-lg border border-neutral-800 p-3"><span className="self-center text-sm">{assets.find(a=>a.id===c.assetId)?.name}</span>{(['start','end','offset','volume'] as const).map(k=><label className="text-xs" key={k}>{k}<input className={`${field} max-w-24`} type="number" min={0} step="0.1" value={c[k]} onChange={e=>change({...studio,sequence:{...studio.sequence,audio:studio.sequence.audio.map(x=>x.id===c.id?{...x,[k]:Number(e.target.value)}:x)}})}/></label>)}<label className="self-center text-xs"><input type="checkbox" checked={c.muted} onChange={e=>change({...studio,sequence:{...studio.sequence,audio:studio.sequence.audio.map(x=>x.id===c.id?{...x,muted:e.target.checked}:x)}})}/> Mute</label><button className={button} onClick={()=>change({...studio,sequence:{...studio.sequence,audio:studio.sequence.audio.filter(x=>x.id!==c.id)}})}>Remove</button></article>)}<p className="text-xs text-neutral-500">Sequence edits are explicit; generating or approving a new take never replaces existing clips.</p></>}
    </fieldset>}
  </section>;
}
