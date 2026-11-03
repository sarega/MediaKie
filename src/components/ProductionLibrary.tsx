import React, {useEffect, useRef, useState} from 'react';
import {Download, Upload, X, Trash2} from 'lucide-react';
import {ASSET_ROLES, type ProductionAsset, type ProductionLibrary as LibraryData} from '../models/assets';
import type {GenerationLog} from '../types';
import {MediaThumbnail} from './MediaThumbnail';

type Props = {
  projectId: string;
  logs: GenerationLog[];
  onUseVideoFrame?: (url: string, time: number) => void;
  onUse: (asset: ProductionAsset, action: 'animate' | 'reference' | 'input' | 'send') => void;
  onHistoryChanged: (logs: GenerationLog[], changedIds: string[]) => void;
};
const MAX_BYTES = 250 * 1024 * 1024;
const inputStyle = 'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm';

export function ProductionLibrary({projectId, logs, onUse, onUseVideoFrame, onHistoryChanged}: Props) {
  const [data, setData] = useState<LibraryData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [role, setRole] = useState('all');
  const [source, setSource] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<ProductionAsset | null>(null);
  const [name, setName] = useState('');
  const [editRole, setEditRole] = useState<ProductionAsset['role']>('other');
  const [tags, setTags] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  const operation = useRef(false);
  const loadCounter = useRef(0);
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const logSignature = JSON.stringify(logs.map(l => [l.id, l.status, l.mediaUrl, l.mediaUrls]));

  const request = async (route: string, options?: RequestInit) => {
    const response = await fetch(base + route, options);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Library request failed');
    return body;
  };
  const load = async () => {
    const token = ++loadCounter.current;
    try {
      const next = await request('/production');
      if (mounted.current && token === loadCounter.current) {setData(next); setError('');}
    } catch (e: any) {if (mounted.current && token === loadCounter.current) setError(e.message);}
  };
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => {if (!operation.current) void load();}, [logSignature]);

  const mutate = async (task: () => Promise<LibraryData>) => {
    if (operation.current) return false;
    operation.current = true; setBusy(true); setError(''); ++loadCounter.current;
    try {
      const next = await task();
      if (mounted.current) {setData(next); setSelected(ids => ids.filter(id => next.assets.some(a => a.id === id)));}
      return true;
    } catch (e: any) {
      if (mounted.current) setError(e.message);
      return false;
    } finally {operation.current = false; if (mounted.current) setBusy(false);}
  };
  const open = (asset: ProductionAsset) => {
    previousFocus.current = document.activeElement as HTMLElement;
    setDetail(asset); setName(asset.name); setEditRole(asset.role); setTags(asset.tags.join(', '));
  };
  useEffect(() => {if (!detail) previousFocus.current?.focus();}, [detail]);
  const importFiles = async (files: FileList | null) => {
    if (!files || !data) return;
    const pending = Array.from(files);
    await mutate(async () => {
      let current = data;
      for (const file of pending) {
        if (!file.size || file.size > MAX_BYTES) throw new Error(`${file.name}: file must be between 1 byte and 250 MB`);
        const extension = file.name.split('.').pop()?.toLowerCase();
        const fallback: Record<string, string> = {png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', mp4:'video/mp4', mov:'video/quicktime', webm:'video/webm', mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', flac:'audio/flac', m4a:'audio/mp4'};
        const next = await request('/assets/import', {method: 'POST', headers: {'Content-Type': fallback[extension || ''] || file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), 'X-Library-Revision': String(current.revision)}, body: file});
        current = next;
        if (mounted.current) setData(current); // Earlier imports remain visible if a later file fails.
      }
      return current;
    });
    if (fileInput.current) fileInput.current.value = '';
  };
  const remove = async (ids: string[]) => {
    if (!data || !ids.length || !window.confirm(`Delete ${ids.length} selected media file(s)? Files still used as generation inputs cannot be deleted. This cannot be undone.`)) return;
    const ok = await mutate(async () => {
      const next = await request('/assets/delete-many', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({revision:data.revision, assetIds:ids})});
      if (mounted.current) onHistoryChanged(next.logs, data.assets.filter(a => ids.includes(a.id) && a.generationLogId).map(a => a.generationLogId!));
      return next;
    });
    if (ok) setDetail(null);
  };
  const exportSelected = async (ids: string[]) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(base + '/assets/export', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({assetIds:ids})});
      if (!response.ok) {const body = await response.json(); throw new Error(body.error || 'Export failed');}
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'selected-assets.zip'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {if (mounted.current) setError(e.message);}
    finally {operation.current = false; if (mounted.current) setBusy(false);}
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data || !detail) return;
    const ok = await mutate(() => request(`/assets/${encodeURIComponent(detail.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({revision:data.revision, name, role:editRole, tags:tags.split(',').map(t => t.trim()).filter(Boolean)})}));
    if (ok) setDetail(null);
  };
  const matches = data?.assets.filter(asset =>
    (kind === 'all' || asset.kind === kind) && (role === 'all' || asset.role === role) && (source === 'all' || asset.source === source) &&
    `${asset.name} ${asset.tags.join(' ')} ${logs.find(l => l.id === asset.generationLogId)?.prompt || ''}`.toLowerCase().includes(search.toLowerCase())
  ) || [];
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(a => a !== id) : [...ids, id]);
  const technical = (asset: ProductionAsset) => [asset.metadata.mimeType, asset.metadata.bytes != null ? `${(asset.metadata.bytes / 1024 / 1024).toFixed(2)} MB` : null, asset.metadata.width && asset.metadata.height ? `${asset.metadata.width} × ${asset.metadata.height}` : null, asset.metadata.duration != null ? `${asset.metadata.duration.toFixed(2)} s` : null].filter(Boolean).join(' · ');

  return <section aria-label="Production library">
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input ref={fileInput} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.mp4,.mov,.webm,.mp3,.wav,.ogg,.flac,.m4a" className="hidden" onChange={e => void importFiles(e.target.files)}/>
      <button disabled={busy || !data} onClick={() => fileInput.current?.click()} className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-2 text-sm disabled:opacity-40"><Upload size={16}/>{busy ? 'Saving…' : 'Import media'}</button>
      <input aria-label="Search production library" placeholder="Search name, tag or prompt…" value={search} onChange={e => setSearch(e.target.value)} className={`${inputStyle} min-w-40 flex-1`}/>
      <select aria-label="Filter media type" className="rounded-lg bg-neutral-900 p-2 text-sm" value={kind} onChange={e => setKind(e.target.value)}>{['all','image','video','audio'].map(v => <option key={v} value={v}>{v === 'all' ? 'All media' : v}</option>)}</select>
      <select aria-label="Filter asset role" className="rounded-lg bg-neutral-900 p-2 text-sm" value={role} onChange={e => setRole(e.target.value)}><option value="all">All roles</option>{ASSET_ROLES.map(v => <option key={v}>{v}</option>)}</select>
      <select aria-label="Filter asset source" className="rounded-lg bg-neutral-900 p-2 text-sm" value={source} onChange={e => setSource(e.target.value)}>{['all','imported','generated'].map(v => <option key={v} value={v}>{v === 'all' ? 'All sources' : v}</option>)}</select>
    </div>
    <p className="mb-4 text-xs text-neutral-500">{matches.length} assets · Import images, videos and audio up to 250 MB each. Running jobs remain in Activity.</p>
    {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error} <button disabled={busy} onClick={() => void load()} className="ml-3 underline">Reload library</button></div>}
    {selected.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-violet-500/10 p-3 text-sm">
      <span className="mr-auto">{selected.length} selected</span>
      <button disabled={busy} onClick={() => setSelected(matches.map(a => a.id))}>Select all visible</button>
      <button disabled={busy} onClick={() => setSelected([])} className="px-2">Clear</button>
      <button disabled={busy} onClick={() => exportSelected(selected)} className="flex items-center gap-1 px-2"><Download size={15}/>Export ZIP</button>
      <button disabled={busy} onClick={() => void remove(selected)} className="flex items-center gap-1 px-2 text-red-300"><Trash2 size={15}/>Delete</button>
    </div>}
    {!data ? <p className="p-10 text-center text-neutral-500">{error ? 'Library could not be loaded.' : 'Loading library…'}</p> : !matches.length ? <p className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-neutral-500">{data.assets.length ? 'No assets match these filters.' : 'Import references or generate media to begin.'}</p> :
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{matches.map(asset => <article key={asset.id} className={`relative overflow-hidden rounded-xl border bg-neutral-900 ${selected.includes(asset.id) ? 'border-violet-400' : 'border-neutral-800'}`}>
        <input type="checkbox" checked={selected.includes(asset.id)} onChange={() => toggle(asset.id)} disabled={busy} aria-label={`Select ${asset.name}`} className="absolute left-3 top-3 z-10 h-5 w-5 accent-violet-500"/>
        <button onClick={() => open(asset)} className="block w-full text-left" aria-label={`Open ${asset.name}`}><MediaThumbnail url={asset.url} type={asset.kind} alt={asset.name}/><div className="p-3"><p className="truncate text-sm">{asset.name}</p><p className="mt-1 text-xs text-neutral-500">{asset.role} · {asset.source}</p><p className="mt-1 truncate text-xs text-neutral-400">{asset.tags.join(' · ')}</p></div></button>
        {(asset.kind === 'image' || asset.kind === 'video') && <div className="border-t border-neutral-800 p-2"><button className="w-full rounded bg-violet-500/15 py-2 text-xs text-violet-200" onClick={() => onUse(asset, 'send')}>{asset.kind === 'video' ? 'Use video frame…' : 'Send image to model…'}</button></div>}
      </article>)}</div>}
    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Asset details" onKeyDown={e => {
      if(e.key === 'Escape' && !busy) setDetail(null);
      if(e.key === 'Tab') {
        const buttons = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary')];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if(e.shiftKey && document.activeElement === first) {e.preventDefault(); last?.focus();}
        else if(!e.shiftKey && document.activeElement === last) {e.preventDefault(); first?.focus();}
      }
    }}>
      <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="truncate">Asset details</h2><button autoFocus disabled={busy} aria-label="Close asset details" onClick={() => setDetail(null)}><X size={20}/></button></div>
        {error && <div role="alert" className="mb-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}<button type="button" disabled={busy} className="ml-3 underline" onClick={() => void load()}>Reload library</button></div>}
        <div className="mb-4 flex min-h-24 justify-center rounded-lg bg-black">{detail.kind === 'image' ? <img src={detail.url} alt={detail.name} className="max-h-[30vh] max-w-full object-contain"/> : detail.kind === 'video' ? <video controls src={detail.url} className="max-h-[30vh] max-w-full"/> : <audio controls src={detail.url} className="my-5 max-w-full"/>}</div>
        <p className="mb-3 break-words text-xs text-neutral-400">{technical(detail) || 'Technical metadata unavailable'} · {detail.source} · {new Date(detail.createdAt).toLocaleString()}</p>
        {detail.sequenceManifestUrl && <a className="mb-3 inline-block text-sm text-violet-300" href={detail.sequenceManifestUrl} download>Download sequence provenance JSON</a>}
        {detail.generationLogId && <details className="mb-4 text-xs text-neutral-400"><summary className="cursor-pointer">Generation source and settings</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(logs.find(l => l.id === detail.generationLogId) && {model:logs.find(l => l.id === detail.generationLogId)!.modelName, prompt:logs.find(l => l.id === detail.generationLogId)!.prompt, settings:logs.find(l => l.id === detail.generationLogId)!.settingsSnapshot}, (_key, value) => typeof value === 'string' && value.startsWith('data:') ? '[media data omitted]' : value, 2) || 'Generation source unavailable'}</pre></details>}
        <form onSubmit={e => void save(e)} className="space-y-3">
          <label className="block text-sm">Name<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} className={`${inputStyle} mt-1`}/></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Role<select value={editRole} onChange={e => setEditRole(e.target.value as ProductionAsset['role'])} className={`${inputStyle} mt-1`}>{ASSET_ROLES.map(v => <option key={v}>{v}</option>)}</select></label><label className="block text-sm">Tags (comma separated)<input value={tags} onChange={e => setTags(e.target.value)} className={`${inputStyle} mt-1`}/></label></div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button disabled={busy} className="rounded-lg bg-violet-500 px-4 py-2 text-sm disabled:opacity-40">{busy ? 'Saving…' : 'Save details'}</button>
            {(detail.kind === 'image' || detail.kind === 'video') && <button type="button" disabled={busy} className="rounded-lg bg-violet-500/20 px-3 py-2 text-sm text-violet-200" onClick={e => {
              const video = e.currentTarget.closest('[role="dialog"]')?.querySelector('video'); video?.pause();
              if (detail.kind === 'video' && onUseVideoFrame) onUseVideoFrame(detail.url, video?.currentTime || 0); else onUse(detail, 'send');
              setDetail(null);
            }}>{detail.kind === 'video' ? 'Use video frame…' : 'Send image to model…'}</button>}
            <button type="button" disabled={busy} onClick={() => {onUse(detail, 'input'); setDetail(null);}} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm">Use as input</button>
            <a className="rounded-lg bg-neutral-800 px-3 py-2 text-sm" href={`/api/download?url=${encodeURIComponent(detail.url)}&filename=${encodeURIComponent(detail.name.includes('.') ? detail.name : `${detail.name}.${detail.url.split('?')[0].split('.').pop() || detail.kind}`)}`}>Download</a>
            <button type="button" disabled={busy} onClick={() => exportSelected([detail.id])} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm">Export ZIP</button>
            <button type="button" disabled={busy} onClick={() => void remove([detail.id])} className="ml-auto px-3 py-2 text-sm text-red-300">Delete asset</button>
          </div>
        </form>
      </div>
    </div>}
  </section>;
}
