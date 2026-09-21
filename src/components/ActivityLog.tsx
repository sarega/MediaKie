import React, { useEffect, useRef, useState } from 'react';
import {MediaThumbnail} from './MediaThumbnail';
import { GenerationLog } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Clock, CheckCircle2, Copy, ExternalLink, FolderOpen, ImagePlus, Trash2, ScanLine } from 'lucide-react';

interface Props {
  logs: GenerationLog[];
  activeLogId?: string;
  autoplayVideos: boolean;
  onSelectLog: (id: string) => void;
  onUseAsSource: (asset: { type: 'image' | 'video'; url: string; label?: string }) => void;
  onGrabVideoFrame: (url: string) => void;
  onRevealFile: (url: string) => void;
  onDeleteLog: (id: string) => void;
  onCancelLog?: (id:string)=>void;
  onResumeLog: (id: string) => void;
}

const HISTORY_PAGE_SIZE = 30;

function MediaPreview({url,type,alt}:{url:string;type:'image'|'video';alt:string;autoplay:boolean}) {
  return <MediaThumbnail url={url} type={type} alt={alt} className="w-full aspect-video"/>;
}

const formatDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
};

const isLocalLibraryUrl = (url: string) => url.startsWith('/library/') || url.startsWith('/projects/');

export function ActivityLog({onCancelLog, logs, activeLogId, autoplayVideos, onSelectLog, onUseAsSource, onGrabVideoFrame, onRevealFile, onDeleteLog, onResumeLog }: Props) {
  const [now, setNow] = useState(Date.now());
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);

  useEffect(() => {
    if (!logs.some((log) => log.status === 'generating')) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [logs]);

  useEffect(() => {
    setVisibleCount(HISTORY_PAGE_SIZE);
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-neutral-500">
        No generation history yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-neutral-800/50">
      {logs.slice(0, visibleCount).map((log) => {
        const isSourceMedia = log.type === 'image' || log.type === 'video';

        return (
        <div
          key={log.id}
          role="button"
          tabIndex={0}
          aria-label={`Select ${log.modelName} history item`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('button, a')) return;
            onSelectLog(log.id);
          }}
          onKeyDown={(event) => {
            if ((event.target as HTMLElement).closest('button, a')) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectLog(log.id);
            }
          }}
          className={`p-4 flex flex-col gap-2 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/70 ${log.id === activeLogId ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-neutral-800/30'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-300 px-2 py-0.5 rounded-full bg-neutral-800">
                {log.modelName}
              </span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {log.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {log.status === 'generating' && (log.pollingState === 'retrying' || log.pollingState === 'timed-out') && <AlertCircle className="w-4 h-4 text-amber-400" />}
              {log.status === 'generating' && (!log.pollingState || log.pollingState === 'active') && <Clock className="w-4 h-4 text-amber-500 animate-pulse" />}
              {log.status === 'failed' && <AlertCircle className="w-4 h-4 text-red-500" />}
              <button
                type="button"
                onClick={() => onDeleteLog(log.id)}
                className="p-1 rounded-md text-neutral-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                title="Remove history item and saved local media"
                aria-label="Remove history item and saved local media"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-500"><span>{log.provider} · {log.normalizedStatus || log.status}</span>{(log.status==='generating'||log.pollingState==='timed-out') && onCancelLog && <button onClick={()=>onCancelLog(log.id)} className="text-violet-300">{log.normalizedStatus==='queued'?'Cancel':'Stop tracking'}</button>}</div>
          {log.estimatedCost && <p className="text-xs text-neutral-500">Estimated: {log.estimatedCost.usd == null ? 'Unverified' : `$${log.estimatedCost.usd.toFixed(4)}`} · Final: {log.finalCost?.usd == null ? 'Not reported' : `$${log.finalCost.usd.toFixed(4)}`}</p>}
          <div className="text-sm text-neutral-400 line-clamp-2 leading-relaxed">
            "{log.prompt}"
          </div>

          <div className="text-[11px] text-neutral-500">
            Time: {log.status === 'generating'
              ? formatDuration(now - new Date(log.timestamp).getTime())
              : log.durationMs
                ? formatDuration(log.durationMs)
                : '-'}
          </div>

          {log.pollingState === 'timed-out' && (
            <div className="flex items-start gap-2 rounded-md bg-amber-400/10 p-2 text-xs text-amber-300" role="status">
              <span className="min-w-0 flex-1">{log.error || 'Task status needs attention.'}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onResumeLog(log.id);
                }}
                className="shrink-0 font-medium underline underline-offset-2 hover:text-white"
              >
                Check status
              </button>
            </div>
          )}

          {log.status === 'failed' && log.error && log.pollingState !== 'timed-out' && (
            <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded-md">
              {log.error}
            </div>
          )}

          {log.status === 'success' && (log.mediaUrls || log.mediaUrl) && (
            <div className="mt-2 text-sm text-neutral-400">
              <div className="flex flex-wrap gap-2">
                {(log.mediaUrls || [log.mediaUrl!]).slice(0, 4).map((url, idx) => (
                  <div
                    key={idx}
                    draggable={isSourceMedia}
                    onDragStart={(event) => {
                      if (!isSourceMedia) return;
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData('application/x-kie-media', JSON.stringify({ type: log.type, url, label: log.modelName }));
                    }}
                    className="relative rounded-md overflow-hidden bg-neutral-900 border border-neutral-800 flex-1 min-w-[45%] group/media"
                  >
                     <MediaPreview url={url} type={log.type === 'video' ? 'video' : 'image'} alt={log.prompt} autoplay={autoplayVideos} />
                    <div className="absolute inset-x-1 bottom-1 flex justify-center gap-1 opacity-0 transition-opacity group-hover/media:opacity-100 group-focus-within/media:opacity-100">
                      {isSourceMedia && (
                        <button
                          type="button"
                          onClick={() => {
                            if (log.type === 'image' || log.type === 'video') {
                              onUseAsSource({ type: log.type, url, label: log.modelName });
                            }
                          }}
                          className="h-7 w-7 rounded-md bg-neutral-950/90 border border-white/10 text-white grid place-items-center hover:bg-neutral-800"
                          title="Use as source"
                          aria-label="Use as source"
                        >
                          <ImagePlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {log.type === 'video' && (
                        <button
                          type="button"
                          onClick={() => onGrabVideoFrame(url)}
                          className="h-7 w-7 rounded-md bg-neutral-950/90 border border-white/10 text-white grid place-items-center hover:bg-neutral-800"
                          title="Grab frame as source image"
                          aria-label="Grab frame as source image"
                        >
                          <ScanLine className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isLocalLibraryUrl(url) && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRevealFile(url);
                          }}
                          className="h-7 w-7 rounded-md border border-white/10 bg-neutral-950/90 text-white grid place-items-center hover:bg-neutral-800"
                          title="Reveal file in Finder"
                          aria-label="Reveal file in Finder"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="h-7 w-7 rounded-md bg-neutral-950/90 border border-white/10 text-white grid place-items-center hover:bg-neutral-800"
                        title="Open media"
                        aria-label="Open media"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {log.status === 'success' && log.textResult && (
            <div className="mt-2 rounded-md border border-neutral-800 bg-neutral-950 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wider text-neutral-500">Generated ID</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(log.textResult || '')}
                  className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
                  title="Copy result"
                  aria-label="Copy result"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-neutral-300">
                {log.textResult}
              </pre>
            </div>
          )}
        </div>
        );
      })}
      {visibleCount < logs.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => Math.min(logs.length, count + HISTORY_PAGE_SIZE))}
          className="mx-4 my-3 rounded-md border border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
        >
          Load older history ({logs.length - visibleCount})
        </button>
      )}
    </div>
  );
}
