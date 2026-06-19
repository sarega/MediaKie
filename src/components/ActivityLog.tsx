import React, { useEffect, useState } from 'react';
import { GenerationLog } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, Clock, CheckCircle2, Copy, ExternalLink, ImagePlus, Trash2, ScanLine } from 'lucide-react';

interface Props {
  logs: GenerationLog[];
  autoplayVideos: boolean;
  onUseAsSource: (asset: { type: 'image' | 'video'; url: string; label?: string }) => void;
  onGrabVideoFrame: (url: string) => void;
  onDeleteLog: (id: string) => void;
}

const formatDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
};

export function ActivityLog({ logs, autoplayVideos, onUseAsSource, onGrabVideoFrame, onDeleteLog }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!logs.some((log) => log.status === 'generating')) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-neutral-500">
        No generation history yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-neutral-800/50">
      {logs.map((log) => {
        const isSourceMedia = log.type === 'image' || log.type === 'video';

        return (
        <div key={log.id} className="p-4 flex flex-col gap-2 hover:bg-neutral-800/30 transition-colors">
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
              {log.status === 'generating' && <Clock className="w-4 h-4 text-amber-500 animate-pulse" />}
              {log.status === 'failed' && <AlertCircle className="w-4 h-4 text-red-500" />}
              <button
                onClick={() => onDeleteLog(log.id)}
                className="p-1 rounded-md text-neutral-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                title="Remove from history"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

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

          {log.status === 'failed' && log.error && (
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
                     {log.type === 'video' ? (
                       <video src={url} className="w-full h-auto max-h-32 object-cover" muted loop controls autoPlay={autoplayVideos} playsInline />
                     ) : (
                       <img src={url} alt={log.prompt} className="w-full h-auto max-h-32 object-cover" />
                     )}
                    <div className="absolute inset-x-1 bottom-1 flex justify-center gap-1 opacity-0 group-hover/media:opacity-100 transition-opacity">
                      {isSourceMedia && (
                        <button
                          onClick={() => {
                            if (log.type === 'image' || log.type === 'video') {
                              onUseAsSource({ type: log.type, url, label: log.modelName });
                            }
                          }}
                          className="h-7 w-7 rounded-md bg-neutral-950/90 border border-white/10 text-white grid place-items-center hover:bg-neutral-800"
                          title="Use as source"
                        >
                          <ImagePlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {log.type === 'video' && (
                        <button
                          onClick={() => onGrabVideoFrame(url)}
                          className="h-7 w-7 rounded-md bg-neutral-950/90 border border-white/10 text-white grid place-items-center hover:bg-neutral-800"
                          title="Grab frame as source image"
                        >
                          <ScanLine className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="h-7 w-7 rounded-md bg-neutral-950/90 border border-white/10 text-white grid place-items-center hover:bg-neutral-800"
                        title="Open media"
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
                  onClick={() => navigator.clipboard?.writeText(log.textResult || '')}
                  className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
                  title="Copy result"
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
    </div>
  );
}
