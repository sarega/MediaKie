import React, {useEffect, useRef, useState} from 'react';
import type {AIModel} from '../types';
import type {ProductionAsset, ProductionLibrary} from '../models/assets';
import {IMAGE_INPUT_LABELS, imageDestination, lastFrameTime, type ImageInputRole} from '../models/imageInputs';
import {MediaThumbnail} from './MediaThumbnail';
import {resolveModel} from '../models/registry';

const button = 'rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40';
const dialogStyle = 'fixed inset-0 m-auto flex max-h-[90dvh] w-[calc(100%-24px)] max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 p-4 text-neutral-100 shadow-2xl backdrop:bg-black/80';
export type VideoFrameSource = {url: string; time: number};

export function MediaSourcePicker({projectId, title, initialVideo, onChoose, onClose}: {
  projectId: string | null; title: string; initialVideo?: VideoFrameSource;
  onChoose: (url: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [assets, setAssets] = useState<ProductionAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [clip, setClip] = useState(initialVideo);
  const [time, setTime] = useState(initialVideo?.time || 0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [seeking, setSeeking] = useState(false);
  useEffect(() => {dialog.current?.showModal();}, []);
  useEffect(() => {
    const controller = new AbortController();
    if (!projectId) {setLoading(false); return;}
    fetch(`/api/projects/${encodeURIComponent(projectId)}/production`, {signal: controller.signal})
      .then(async response => {const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to load library'); return body as ProductionLibrary;})
      .then(data => setAssets(data.assets.filter(a => a.kind === 'image' || a.kind === 'video')))
      .catch(e => {if (!controller.signal.aborted) setError(e.message);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [projectId]);
  const seek = (next: number) => {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = Math.max(0, Math.min(next, lastFrameTime(duration)));
  };
  const capture = () => {
    const source = video.current;
    if (!source || source.seeking || source.readyState < 2) return;
    source.pause();
    try {
      const canvas = document.createElement('canvas');
      canvas.width = source.videoWidth; canvas.height = source.videoHeight;
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) throw new Error('This video frame is not ready. Try another position.');
      context.drawImage(source, 0, 0);
      onChoose(canvas.toDataURL('image/png'));
    } catch {setError('Unable to read this frame. For remote videos, download and import the clip into Library first.');}
  };
  return <dialog ref={dialog} className={dialogStyle} aria-label={title} onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="mb-3 flex shrink-0 items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2><button autoFocus className={button} onClick={onClose}>Cancel</button></div>
    {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
    {clip ? <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2"><button className={button} onClick={() => {setClip(undefined); setError('');}}>← Library</button><span className="text-xs text-neutral-400">Pause at the frame you want, then use it below.</span></div>
      <video key={clip.url} ref={video} src={clip.url} crossOrigin="anonymous" controls playsInline preload="auto" className="min-h-0 w-full max-h-[45dvh] rounded-lg bg-black object-contain"
        onLoadedMetadata={e => {const v = e.currentTarget; const length = Number.isFinite(v.duration) ? v.duration : 0; setDuration(length); if (clip.time > 0) v.currentTime = Math.min(clip.time, lastFrameTime(length));}}
        onLoadedData={() => setReady(true)} onSeeking={() => setSeeking(true)} onSeeked={() => {setSeeking(false); setReady(true);}}
        onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onError={() => {setReady(false); setError('Unable to load this video. Try an imported local clip.');}}/>
      <div className="flex items-center gap-3"><input aria-label="Frame time" type="range" min={0} max={lastFrameTime(duration)} step={0.001} value={Math.min(time, lastFrameTime(duration))} onChange={e => seek(Number(e.target.value))} className="min-w-0 flex-1 accent-violet-500"/><span className="text-xs tabular-nums">{time.toFixed(3)} / {duration.toFixed(3)}s</span></div>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={!ready} onClick={() => seek(0)}>Start of clip</button><button className={button} disabled={!ready} onClick={() => seek(lastFrameTime(duration))}>End of clip</button><button className={`${button} ml-auto border-violet-500 text-violet-200`} disabled={!ready || seeking} onClick={capture}>Use this frame</button></div>
    </div> : <div className="min-h-0 overflow-y-auto">
      <p className="mb-3 text-sm text-neutral-400">Choose an image, or open a video to pick a still. Current project Library.</p>
      <input aria-label="Search source library" placeholder="Search images and videos…" value={search} onChange={e => setSearch(e.target.value)} className="mb-3 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-sm"/>
      {loading ? <p>Loading library…</p> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{assets.filter(a => `${a.name} ${a.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase())).map(asset => <button key={asset.id} className="overflow-hidden rounded-lg border border-neutral-700 text-left hover:border-violet-400" aria-label={`${asset.kind === 'video' ? 'Pick frame from' : 'Use image'} ${asset.name}`} onClick={() => {if (asset.kind === 'image') onChoose(asset.url); else {setReady(false); setSeeking(false); setTime(0); setDuration(0); setError(''); setClip({url: asset.url, time: 0});}}}>
        <MediaThumbnail url={asset.url} type={asset.kind} alt={asset.name} className="aspect-video w-full"/><span className="block truncate p-2 text-xs">{asset.name}</span><span className="block px-2 pb-2 text-xs text-violet-300">{asset.kind === 'video' ? 'Pick a video frame →' : 'Use image →'}</span>
      </button>)}</div>}
      {!loading && !assets.length && <p className="text-sm text-neutral-400">No images or videos yet. Import them in Library, or use Upload in the input slot.</p>}
    </div>}
  </dialog>;
}

export function ImageDestinationDialog({url, models, selectedModel, onChoose, onClose}: {
  url: string; models: AIModel[]; selectedModel: AIModel;
  onChoose: (model: AIModel, role: ImageInputRole) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [role, setRole] = useState<ImageInputRole>('first');
  const [modelKey, setModelKey] = useState(`${selectedModel.category}:${selectedModel.id}`);
  useEffect(() => {dialog.current?.showModal();}, []);
  const candidates = models.filter(m => !resolveModel(m)?.unavailableReason && imageDestination(m, role));
  const model = candidates.find(m => `${m.category}:${m.id}` === modelKey) || candidates[0];
  return <dialog ref={dialog} className={dialogStyle} aria-label="Send image to model" onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">Send image to model</h2><button autoFocus className={button} onClick={onClose}>Cancel</button></div>
    <img src={url} alt="Selected source frame" className="mb-4 min-h-0 max-h-[35dvh] w-full object-contain"/>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Image destination">{(Object.keys(IMAGE_INPUT_LABELS) as ImageInputRole[]).map(value => <button key={value} className={`${button} ${role === value ? 'border-violet-400 text-violet-200' : ''}`} aria-pressed={role === value} onClick={() => {if (model) setModelKey(`${model.category}:${model.id}`); setRole(value);}}>{IMAGE_INPUT_LABELS[value]}</button>)}</div>
    <label className="mt-4 text-sm">Destination model<select aria-label="Destination model" className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-2" value={model ? `${model.category}:${model.id}` : ''} onChange={e => setModelKey(e.target.value)}>{candidates.map(m => <option key={`${m.category}:${m.id}`} value={`${m.category}:${m.id}`}>{m.name} · {m.provider}</option>)}</select></label>
    <p className="my-3 text-xs text-neutral-400">Only models accepting {IMAGE_INPUT_LABELS[role].toLowerCase()} are shown. This fills the input; generation starts only when you press Generate.</p>
    <button className={`${button} border-violet-500 text-violet-200`} disabled={!model} onClick={() => model && onChoose(model, role)}>Send to {model?.name || 'model'} · {IMAGE_INPUT_LABELS[role]}</button>
  </dialog>;
}
