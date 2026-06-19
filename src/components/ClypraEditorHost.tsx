import React, { useMemo, useRef, useState } from 'react';
import { Download, Film, Loader2, Play, Plus, Scissors, Trash2 } from 'lucide-react';
import {
  ClypraAsset,
  ClypraTimelineClip,
  MediaKieAssetAdapter,
  MediaKieProjectAdapter,
  createBrowserNativeMediaBridge,
  createStubExportAdapter,
  createTimelineClipFromAsset,
  formatClypraSeconds,
  getTimelineDuration,
} from '../editor/clypra';
import { cn } from '../lib/utils';

const projectId = 'experimental-clypra';

export function ClypraEditorHost() {
  const nativeBridge = useMemo(() => createBrowserNativeMediaBridge(), []);
  const exportAdapter = useMemo(() => createStubExportAdapter(), []);
  const [assets, setAssets] = useState<ClypraAsset[]>([]);
  const [clips, setClips] = useState<ClypraTimelineClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [isAddingClip, setIsAddingClip] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const selectedClip = clips.find((clip) => clip.id === selectedClipId) || clips[0] || null;
  const timelineDuration = getTimelineDuration(clips);

  const projectAdapter = useMemo<MediaKieProjectAdapter>(() => ({
    getProject: () => ({
      id: projectId,
      name: 'Experimental Clypra Edit',
      assets,
      clips,
      updatedAt: new Date().toISOString(),
    }),
    updateProject: (project) => {
      setAssets(project.assets);
      setClips(project.clips);
    },
  }), [assets, clips]);

  const assetAdapter = useMemo<MediaKieAssetAdapter>(() => ({
    addAsset: (asset: ClypraAsset) => {
      setAssets((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset]);
    },
    listAssets: () => assets,
  }), [assets]);

  const addClipFromAsset = async (asset: ClypraAsset) => {
    if (asset.kind !== 'video') {
      setExportMessage('Only video clips can be placed on the experimental timeline.');
      return;
    }

    setIsAddingClip(true);
    try {
      assetAdapter.addAsset(asset);
      const duration = await nativeBridge.getVideoDuration(asset.url);
      const clip = createTimelineClipFromAsset({ ...asset, duration }, duration);
      setClips((current) => [...current, clip]);
      setSelectedClipId(clip.id);
      setExportMessage('');
    } finally {
      setIsAddingClip(false);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    const asset = nativeBridge.readDroppedKieMedia(event);
    if (!asset) return;
    event.preventDefault();
    await addClipFromAsset(asset);
  };

  const removeClip = (clipId: string) => {
    setClips((current) => {
      const next = current.filter((clip) => clip.id !== clipId);
      if (selectedClipId === clipId) setSelectedClipId(next[0]?.id || '');
      return next;
    });
  };

  const splitClip = () => {
    if (!selectedClip || selectedClip.end - selectedClip.start < 0.4) return;

    const midpoint = selectedClip.start + (selectedClip.end - selectedClip.start) / 2;
    const left = { ...selectedClip, id: crypto.randomUUID(), end: midpoint };
    const right = { ...selectedClip, id: crypto.randomUUID(), start: midpoint };
    setClips((current) => current.flatMap((clip) => clip.id === selectedClip.id ? [left, right] : [clip]));
    setSelectedClipId(right.id);
  };

  const updateSelectedClip = (patch: Partial<ClypraTimelineClip>) => {
    if (!selectedClip) return;
    setClips((current) => current.map((clip) => {
      if (clip.id !== selectedClip.id) return clip;
      const next = { ...clip, ...patch };
      const start = Math.max(0, Math.min(next.start, next.duration - 0.1));
      const end = Math.max(start + 0.1, Math.min(next.end, next.duration));
      return { ...next, start, end };
    }));
  };

  const handleExport = async () => {
    const result = await exportAdapter.exportTimeline({
      project: projectAdapter.getProject(),
      format: 'webm',
    });
    setExportMessage(result.ok ? 'Export complete.' : result.error || 'Clypra export is not connected yet.');
  };

  return (
    <div
      className="flex h-full w-full flex-col bg-neutral-950"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('application/x-kie-media')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/70 px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-neutral-100">Clypra Editor Host</p>
          <p className="text-xs text-neutral-500">Experimental adapter mount · {clips.length} clips · {formatClypraSeconds(timelineDuration)}</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={clips.length === 0}
          className="flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex min-w-0 flex-col">
          <div className="min-h-0 flex-1 p-6">
            <div className="relative flex h-full items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-black">
              {selectedClip ? (
                <video
                  ref={previewVideoRef}
                  src={selectedClip.url}
                  className="h-full w-full object-contain"
                  controls
                  muted
                  playsInline
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-neutral-500">
                  {isAddingClip ? <Loader2 className="h-10 w-10 animate-spin text-indigo-400" /> : <Film className="h-12 w-12 text-neutral-700" />}
                  <p className="text-sm">Drop generated videos here to test the Clypra mount.</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-neutral-800 bg-neutral-900/70 p-4">
            <div className="flex min-h-28 gap-3 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 custom-scrollbar">
              {clips.length === 0 ? (
                <div className="grid min-w-full place-items-center rounded-md border border-dashed border-neutral-800 text-sm text-neutral-600">
                  Drag clips from Activity Log
                </div>
              ) : clips.map((clip, index) => (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => {
                    setSelectedClipId(clip.id);
                    if (previewVideoRef.current) {
                      previewVideoRef.current.src = clip.url;
                      previewVideoRef.current.currentTime = clip.start;
                    }
                  }}
                  className={cn(
                    'relative h-24 w-36 shrink-0 overflow-hidden rounded-md border bg-neutral-900 text-left transition-colors',
                    clip.id === selectedClip?.id ? 'border-indigo-400 ring-2 ring-indigo-500/30' : 'border-neutral-800 hover:border-neutral-600',
                  )}
                >
                  <video src={clip.url} className="h-full w-full object-cover opacity-70" muted playsInline />
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2">
                    <p className="truncate text-xs font-medium text-white">{index + 1}. {clip.label}</p>
                    <p className="text-[11px] text-neutral-400">{formatClypraSeconds(clip.end - clip.start)}</p>
                  </div>
                </button>
              ))}
            </div>
            {exportMessage && <p className="mt-2 text-xs text-neutral-500">{exportMessage}</p>}
          </div>
        </div>

        <div className="border-l border-neutral-800 bg-neutral-900/50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Clypra Clip</h3>
          {selectedClip ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="truncate text-sm font-medium text-neutral-100">{selectedClip.label}</p>
                <p className="mt-1 text-xs text-neutral-500">Source length {formatClypraSeconds(selectedClip.duration)}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Trim Start</label>
                <input
                  type="range"
                  min={0}
                  max={selectedClip.duration}
                  step={0.1}
                  value={selectedClip.start}
                  onChange={(event) => updateSelectedClip({ start: Number(event.target.value) })}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Trim End</label>
                <input
                  type="range"
                  min={0}
                  max={selectedClip.duration}
                  step={0.1}
                  value={selectedClip.end}
                  onChange={(event) => updateSelectedClip({ end: Number(event.target.value) })}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => previewVideoRef.current?.play()}
                  className="flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  <Play className="h-4 w-4" />
                  Play
                </button>
                <button
                  type="button"
                  onClick={splitClip}
                  className="flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  <Scissors className="h-4 w-4" />
                  Split
                </button>
                <button
                  type="button"
                  onClick={() => addClipFromAsset({
                    id: crypto.randomUUID(),
                    kind: 'video',
                    url: selectedClip.url,
                    label: `${selectedClip.label} copy`,
                  })}
                  className="flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  <Plus className="h-4 w-4" />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => removeClip(selectedClip.id)}
                  className="flex h-9 items-center justify-center gap-2 rounded-md border border-red-500/30 text-sm text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-lg border border-dashed border-neutral-800 p-5 text-center text-sm text-neutral-500">
              Select a clip to inspect the adapter state.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
