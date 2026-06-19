export type ClypraAssetKind = 'image' | 'video' | 'audio';

export interface ClypraAsset {
  id: string;
  kind: ClypraAssetKind;
  url: string;
  label: string;
  duration?: number;
}

export interface ClypraTimelineClip {
  id: string;
  assetId: string;
  url: string;
  label: string;
  start: number;
  end: number;
  duration: number;
}

export interface ClypraProjectSnapshot {
  id: string;
  name: string;
  assets: ClypraAsset[];
  clips: ClypraTimelineClip[];
  updatedAt: string;
}

export interface ClypraExportRequest {
  project: ClypraProjectSnapshot;
  format: 'webm' | 'mp4';
}

export interface ClypraExportResult {
  ok: boolean;
  url?: string;
  error?: string;
}
