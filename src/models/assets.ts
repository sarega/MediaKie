export const ASSET_ROLES = ['character', 'location', 'style', 'storyboard', 'video', 'voice', 'music', 'other'] as const;
export type AssetRole = typeof ASSET_ROLES[number];
export type AssetKind = 'image' | 'video' | 'audio';
export interface ProductionAsset {
  id: string;
  name: string;
  kind: AssetKind;
  role: AssetRole;
  tags: string[];
  url: string;
  source: 'imported' | 'generated';
  createdAt: string;
  generationLogId?: string;
  outputIndex?: number;
  sequenceManifestUrl?: string;
  metadata: {mimeType?: string; bytes?: number; width?: number; height?: number; duration?: number};
}
export interface ProductionLibrary {
  schemaVersion: 1;
  revision: number;
  assets: ProductionAsset[];
  studio?: ProductionStudio;
}
export interface ProductionScene {id: string; title: string; notes: string;}
export interface ProductionShot {
  id: string; sceneId: string; title: string; action: string; camera: string; lighting: string; dialogue: string;
  duration: number; referenceAssetIds: string[]; storyboardAssetId?: string; approvedAssetId?: string;
  modelId: string; category: string; settings: Record<string, unknown>;
  inheritReferences?: boolean; takeNotes?: Record<string,string>;
}
export interface SequenceClip {id: string; assetId: string; start: number; end: number; volume: number; shotId?: string;}
export interface SequenceAudio extends SequenceClip {offset: number; muted: boolean;}
export interface ProductionStudio {
  brief: string; look: string; defaultReferenceAssetIds: string[];
  scenes: ProductionScene[]; shots: ProductionShot[];
  sequence: {clips: SequenceClip[]; audio: SequenceAudio[]; ratio: '16:9'|'9:16'|'1:1'; resolution: '720p'|'1080p'; fps: 24|25|30;};
}
export const emptyStudio = (): ProductionStudio => ({brief:'', look:'', defaultReferenceAssetIds:[], scenes:[], shots:[], sequence:{clips:[],audio:[],ratio:'16:9',resolution:'720p',fps:24}});
export function studioAssetIds(studio?: ProductionStudio): string[] {
  return studio ? [...studio.defaultReferenceAssetIds, ...studio.shots.flatMap(s => [...s.referenceAssetIds, ...Object.keys(s.takeNotes||{}), s.storyboardAssetId, s.approvedAssetId].filter(Boolean) as string[]), ...studio.sequence.clips.map(c => c.assetId), ...studio.sequence.audio.map(c => c.assetId)] : [];
}
export function localMediaUrls(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('/library/') || value.startsWith('/projects/') ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(localMediaUrls);
  return value && typeof value === 'object' ? Object.values(value).flatMap(localMediaUrls) : [];
}
