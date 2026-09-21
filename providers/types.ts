import type { Cost, Mapping, ProviderId, RegistryModel } from '../src/models/registry';
export type JobStatus = 'queued' | 'submitting' | 'running' | 'completed' | 'failed' | 'canceled' | 'unknown';
export interface ProviderResult {
    taskId: string;
    status: JobStatus;
    outputs: string[];
    text?: string;
    error?: string;
    statusUrl?: string;
    cancelUrl?: string;
    finalCost?: Cost;
}
export interface Job extends ProviderResult {
    historyId?: string;
    hidden?: boolean;
    id: string;
    logicalModel: string;
    provider: ProviderId;
    mapping: Mapping;
    prompt: string;
    settings: Record<string, any>;
    estimatedCost: Cost;
    createdAt: string;
    updatedAt: string;
    projectId: string;
}
export interface ProviderAdapter {
    id: ProviderId;
    catalog(): RegistryModel[];
    estimate(model: RegistryModel, settings: Record<string, any>, sourceType?: 'image' | 'video', sourceDuration?: number): Cost;
    prepare(model: RegistryModel, settings: Record<string, any>): Record<string, any>;
    submit(mapping: Mapping, input: Record<string, any>): Promise<ProviderResult>;
    poll(job: ProviderResult, mapping: Mapping): Promise<ProviderResult>;
    normalize(payload: any, mapping?: Mapping): ProviderResult;
    cancel?(job: ProviderResult): Promise<void>;
    health(): Promise<{
        state: 'connected' | 'configured' | 'error';
        message: string;
    }>;
}
export class ProviderError extends Error {
    constructor(message: string, public status = 502, public retryable = false) { super(message); }
}
export async function responseJson(response: Response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new ProviderError(`Provider request failed (${response.status}). Check credentials, balance and model access.`, response.status, [429, 500, 502, 503, 504].includes(response.status));
    return data;
}
export function mediaUrls(value: any): string[] {
    if (!value)
        return [];
    if (typeof value === 'string') {
        try {
            return mediaUrls(JSON.parse(value));
        }
        catch {
            return /^https?:\/\//.test(value) ? [value] : [];
        }
    }
    if (Array.isArray(value))
        return value.flatMap(mediaUrls);
    if (typeof value === 'object')
        return [...new Set(['url', 'resultUrls', 'urls', 'imageUrls', 'images', 'videoUrls', 'videos', 'video', 'audio', 'audios', 'output', 'response'].flatMap(k => mediaUrls(value[k])))];
    return [];
}
