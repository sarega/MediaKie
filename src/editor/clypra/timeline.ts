import { ClypraAsset, ClypraTimelineClip } from './types';

export const createTimelineClipFromAsset = (
  asset: ClypraAsset,
  duration: number,
): ClypraTimelineClip => ({
  id: crypto.randomUUID(),
  assetId: asset.id,
  url: asset.url,
  label: asset.label,
  start: 0,
  end: Math.max(0.1, duration),
  duration: Math.max(0.1, duration),
});

export const getTimelineDuration = (clips: ClypraTimelineClip[]) => {
  return clips.reduce((total, clip) => total + Math.max(0, clip.end - clip.start), 0);
};

export const formatClypraSeconds = (value: number) => {
  if (!Number.isFinite(value)) return '0.0s';
  return `${Math.max(0, value).toFixed(1)}s`;
};
