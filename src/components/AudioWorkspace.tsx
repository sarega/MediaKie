import React, {useEffect, useState} from 'react';
import {Download, Loader2, Mic2, PanelLeftOpen, PanelRightOpen, Sparkles} from 'lucide-react';
import type {AIModel, GenerationLog} from '../types';

export function AudioWorkspace({model, latestLog, isSubmitting, onGenerate, onOpenModelPane, onOpenActivityPane, onStartNew}:{
  model:AIModel; latestLog?:GenerationLog; isSubmitting:boolean;
  onGenerate:(text:string, image?:string, video?:string, params?:Record<string,any>)=>void;
  onOpenModelPane:()=>void; onOpenActivityPane:()=>void; onStartNew:()=>void;
}) {
  const [text,setText]=useState('');
  const [style,setStyle]=useState('Warm, natural and clear.');
  const [voice,setVoice]=useState('Zephyr');
  const [temperature,setTemperature]=useState(1);
  const [stability,setStability]=useState(.5);
  const [similarity,setSimilarity]=useState(.75);
  const [elevenStyle,setElevenStyle]=useState(0);
  const [speed,setSpeed]=useState(1);
  const isGemini=model.id.startsWith('google/gemini');
  const voiceParam=model.params?.find(p=>p.key===(isGemini?'voice_name':'voice'));
  useEffect(()=>{setVoice(String(voiceParam?.defaultValue||''));},[model.id]);
  const generating=latestLog?.status==='generating';
  const create=()=>{if(text.trim())onGenerate(text,undefined,undefined,isGemini?{voice_name:voice,style:style.trim(),temperature,__policy:'manual',__provider:'kie'}:{voice,stability,similarity_boost:similarity,style:elevenStyle,speed,__policy:'manual',__provider:'kie'});};
  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3"><button onClick={onOpenModelPane} aria-label="Open model pane"><PanelLeftOpen className="h-4 w-4"/></button><div><h1 className="font-semibold">{model.name}</h1><p className="text-xs text-neutral-500">Powered by {model.provider} · text to speech</p></div></div>
      <button onClick={onOpenActivityPane} className="flex items-center gap-2 text-sm text-neutral-400"><PanelRightOpen className="h-4 w-4"/> Activity</button>
    </header>
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center">
        {generating ? <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/50"><Loader2 className="h-8 w-8 animate-spin text-violet-400"/><p>Creating your voice…</p><p className="text-xs text-neutral-500">Using {latestLog.modelName}</p></div>
        : latestLog?.status==='success'&&latestLog.mediaUrl ? <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-neutral-900 p-6 sm:p-10"><div className="mb-6 flex items-center gap-3"><div className="rounded-full bg-violet-500/20 p-3"><Mic2 className="h-6 w-6 text-violet-300"/></div><div><h2 className="font-medium">Speech ready</h2><p className="text-xs text-neutral-500">{latestLog.modelName}</p></div></div><audio controls className="w-full" src={latestLog.mediaUrl}/><div className="mt-6 flex gap-3"><button onClick={onStartNew} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm">New speech</button><a href={`/api/download?url=${encodeURIComponent(latestLog.mediaUrl)}&filename=${latestLog.id}.mp3`} className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm text-white"><Download className="h-4 w-4"/>Download</a></div></div>
        : latestLog?.status==='failed' ? <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center"><p>Speech generation failed</p><p className="mt-2 text-sm text-neutral-500">{latestLog.error}</p><button onClick={onStartNew} className="mt-5 rounded-lg border border-neutral-700 px-4 py-2 text-sm">Try again</button></div>
        : <div className="py-12 text-center"><div className="mx-auto mb-4 w-fit rounded-full bg-violet-500/15 p-4"><Mic2 className="h-8 w-8 text-violet-300"/></div><h2 className="text-xl font-medium">Turn writing into a voice</h2><p className="mt-2 text-sm text-neutral-500">Write the script and direct how it should sound.</p></div>}
      </div>
      {!generating&&<div className="mx-auto mt-5 w-full max-w-4xl rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-2xl">
        <label className="text-xs font-medium text-neutral-300">Text to speak<textarea value={text} onChange={e=>setText(e.target.value)} rows={5} placeholder="Write what you want the voice to say…" className="mt-2 w-full resize-y rounded-xl border border-neutral-700 bg-neutral-950 p-4 text-sm outline-none focus:border-violet-500"/></label>
        <div className={`mt-4 grid gap-3 ${isGemini?'sm:grid-cols-[1fr_2fr]':'sm:grid-cols-2'}`}>
          <label className="text-xs text-neutral-400">Voice<select value={voice} onChange={e=>setVoice(e.target.value)} className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm text-neutral-100">{voiceParam?.options?.map(option=><option key={String(option.value)} value={option.value}>{option.label}</option>)}</select></label>
          {isGemini&&<label className="text-xs text-neutral-400">Speaking style<input value={style} onChange={e=>setStyle(e.target.value)} placeholder="Calm, intimate, slow, with gentle pauses…" className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm text-neutral-100"/></label>}
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-5">{isGemini?<Range label="Creativity" value={temperature} min={0} max={2} step={.1} onChange={setTemperature}/>:<><Range label="Stability" value={stability} onChange={setStability}/><Range label="Similarity" value={similarity} onChange={setSimilarity}/><Range label="Style" value={elevenStyle} onChange={setElevenStyle}/><Range label="Speed" value={speed} min={.7} max={1.2} step={.05} onChange={setSpeed}/></>}</div>
          <button onClick={create} disabled={!text.trim()||isSubmitting} className="flex items-center gap-2 rounded-xl bg-violet-500 px-6 py-3 font-medium text-white disabled:opacity-40"><Sparkles className="h-4 w-4"/>{isSubmitting?'Submitting…':'Generate speech'}</button>
        </div>
      </div>}
    </main>
  </div>;
}

function Range({label,value,onChange,min=0,max=1,step=.05}:{label:string;value:number;onChange:(value:number)=>void;min?:number;max?:number;step?:number}) {
  return <label className="text-xs text-neutral-400">{label} · {value.toFixed(2)}<input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} className="mt-2 block w-32 accent-violet-500"/></label>;
}
