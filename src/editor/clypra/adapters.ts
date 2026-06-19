import type React from 'react';
import { ClypraAsset, ClypraExportRequest, ClypraExportResult, ClypraProjectSnapshot } from './types';

export interface NativeMediaBridge {
  getVideoDuration(url: string): Promise<number>;
  readDroppedKieMedia(event: React.DragEvent<HTMLElement>): ClypraAsset | null;
}

export interface MediaKieAssetAdapter {
  addAsset(asset: ClypraAsset): void;
  listAssets(): ClypraAsset[];
}

export interface MediaKieProjectAdapter {
  getProject(): ClypraProjectSnapshot;
  updateProject(project: ClypraProjectSnapshot): void;
}

export interface MediaKieExportAdapter {
  exportTimeline(request: ClypraExportRequest): Promise<ClypraExportResult>;
}

export const createBrowserNativeMediaBridge = (): NativeMediaBridge => ({
  getVideoDuration(url: string) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;
      video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 5);
      video.onerror = () => resolve(5);
    });
  },

  readDroppedKieMedia(event: React.DragEvent<HTMLElement>) {
    const raw = event.dataTransfer.getData('application/x-kie-media');
    if (!raw) return null;

    try {
      const asset = JSON.parse(raw) as { id?: string; type?: string; url?: string; label?: string };
      if (!asset.url || !asset.type) return null;
      if (asset.type !== 'image' && asset.type !== 'video') return null;

      return {
        id: asset.id || crypto.randomUUID(),
        kind: asset.type,
        url: asset.url,
        label: asset.label || 'MediaKie asset',
      };
    } catch (error) {
      console.warn('Invalid dropped Clypra asset.', error);
      return null;
    }
  },
});

export const createStubExportAdapter = (): MediaKieExportAdapter => ({
  async exportTimeline() {
    // TODO: Wire Clypra export to the MediaKie project library once the export
    // contract is finalized. This is intentionally a no-op while the editor is
    // behind the experimental feature flag.
    return {
      ok: false,
      error: 'Clypra export is not connected yet.',
    };
  },
});
