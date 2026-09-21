import React, {useEffect, useMemo, useState} from 'react';
import {Check, Download, Trash2, X} from 'lucide-react';
import type {GenerationLog} from '../types';
import {MediaThumbnail} from './MediaThumbnail';

type LibraryGalleryProps = {
  logs: GenerationLog[];
  onInspect: (log: GenerationLog) => void;
  onAnimate: (log: GenerationLog) => void;
  onReference: (log: GenerationLog) => void;
  onDelete: (ids: string[]) => Promise<boolean>;
  onExport: (ids: string[]) => void;
};

export function LibraryGallery({logs, onInspect, onAnimate, onReference, onDelete, onExport}: LibraryGalleryProps) {
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const matches = useMemo(() => logs.filter((log) =>
    (type === 'all' || log.type === type) && (status === 'all' || log.status === status) &&
    `${log.prompt} ${log.modelName} ${log.provider}`.toLowerCase().includes(search.toLowerCase())
  ), [logs, search, status, type]);

  useEffect(() => {
    const available = new Set(logs.map((log) => log.id));
    setSelected((current) => new Set([...current].filter((id) => available.has(id))));
  }, [logs]);

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const deleteSelected = async () => {
    if (await onDelete([...selected])) setSelected(new Set());
  };

  return <section>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex gap-1 rounded-lg bg-neutral-900 p-1">{[['all', 'All'], ['image', 'Images'], ['video', 'Videos']].map(([id, label]) =>
        <button key={id} aria-pressed={type === id} onClick={() => setType(id)} className={`rounded px-3 py-2 text-sm ${type === id ? 'bg-violet-500/20 text-violet-200' : 'text-neutral-400'}`}>{label}</button>
      )}</div>
      <select aria-label="Filter generation status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg bg-neutral-900 p-2 text-sm"><option value="all">All statuses</option><option value="success">Completed</option><option value="generating">Generating / queued</option><option value="failed">Failed / canceled</option></select>
      <input aria-label="Search library" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search prompt or model…" className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-sm"/>
      <span className="text-xs text-neutral-500">{matches.length} results</span>
      <button onClick={() => { setSelecting((value) => !value); setSelected(new Set()); }} className={`rounded-lg border px-3 py-2 text-sm ${selecting ? 'border-violet-500 bg-violet-500/15 text-violet-200' : 'border-neutral-800 text-neutral-300'}`}>{selecting ? 'Done' : 'Select'}</button>
    </div>
    {selecting && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
      <strong className="mr-auto text-sm text-violet-100">{selected.size} selected</strong>
      <button onClick={() => setSelected(new Set(matches.map((log) => log.id)))} disabled={!matches.length} className="rounded-lg px-3 py-2 text-sm text-neutral-200 hover:bg-white/5 disabled:opacity-40">Select all visible</button>
      <button onClick={() => setSelected(new Set())} disabled={!selected.size} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-40"><X size={15}/> Clear</button>
      <button onClick={() => onExport([...selected])} disabled={!selected.size} className="flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-100 disabled:opacity-40"><Download size={15}/> Export ZIP</button>
      <button onClick={() => void deleteSelected()} disabled={!selected.size} className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200 disabled:opacity-40"><Trash2 size={15}/> Delete selected</button>
    </div>}
    {matches.length === 0 ? <p className="rounded-xl border border-dashed border-neutral-800 p-10 text-center text-neutral-500">{logs.length ? 'No results match these filters.' : 'Your creations will appear here.'}</p> :
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{matches.map((log) => {
        const url = log.mediaUrl || log.mediaUrls?.[0];
        const isSelected = selected.has(log.id);
        const displayedLog = {...log, mediaUrl: url};
        return <article key={log.id} className={`relative overflow-hidden rounded-xl border bg-neutral-900 ${isSelected ? 'border-violet-400 ring-2 ring-violet-500/25' : 'border-neutral-800'}`}>
          {selecting && <button onClick={() => toggle(log.id)} aria-label={`Select ${log.modelName}`} aria-pressed={isSelected} className={`absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border shadow-lg ${isSelected ? 'border-violet-300 bg-violet-500 text-white' : 'border-neutral-500 bg-black/70 text-transparent'}`}><Check size={16}/></button>}
          {!selecting && <button onClick={() => void onDelete([log.id])} aria-label={`Delete ${log.modelName} item`} title="Delete item" className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-black/75 text-neutral-300 shadow-lg hover:border-red-400 hover:text-red-300"><Trash2 size={15}/></button>}
          <button onClick={() => selecting ? toggle(log.id) : onInspect(displayedLog)} className="block w-full text-left hover:bg-neutral-800" aria-label={selecting ? `Toggle ${log.modelName} selection` : `Open ${log.modelName} result`}>
            <MediaThumbnail url={url} type={log.type} status={log.status} alt={log.prompt}/><div className="p-3"><p className="truncate text-sm">{log.prompt || log.modelName}</p><p className="mt-1 text-xs text-neutral-500">{log.modelName} · {log.status === 'success' ? 'Completed' : log.normalizedStatus || log.status}</p></div>
          </button>
          {!selecting && url && log.type === 'image' && <div className="flex gap-2 border-t border-neutral-800 p-2"><button onClick={() => onAnimate(displayedLog)} className="flex-1 rounded-lg bg-violet-500/15 py-2 text-xs text-violet-200">Animate → I2V</button><button onClick={() => onReference(displayedLog)} className="flex-1 rounded-lg bg-neutral-800 py-2 text-xs text-neutral-300">Use as reference</button></div>}
        </article>;
      })}</div>}
  </section>;
}
