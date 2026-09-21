import { MODEL_REGISTRY, estimateCost } from '../src/models/registry';
import { mediaUrls, ProviderError, responseJson, type ProviderAdapter } from './types';
export function safeHiggsfieldUrl(value: string) {
    const url = new URL(value);
    if (url.origin !== 'https://api.higgsfield.ai' || url.username || url.password)
        throw new ProviderError('Unexpected Higgsfield lifecycle URL');
    return url.toString();
}
export function higgsfieldAdapter(credentials: () => string): ProviderAdapter {
    const request = async (url: string, body?: any) => {
        if (!credentials())
            throw new ProviderError('Configure Higgsfield key ID and secret in Settings.', 401);
        return fetch(safeHiggsfieldUrl(url), { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Key ${credentials()}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(30000) });
    };
    const adapter: ProviderAdapter = {
        id: 'higgsfield', catalog: () => MODEL_REGISTRY.filter(m => m.mappings.some(p => p.provider === 'higgsfield')),
        estimate: (m, p) => estimateCost(m, 'higgsfield', p),
        prepare: (model, settings) => {
            const input = { ...settings };
            if (model.category === 'image-to-video') {
                input.image_url = input.__sourceImage || input.image_url || input.image_urls?.[0];
                if (!input.image_url)
                    throw new Error('Add an input image');
            }
            delete input.__sourceImage;
            delete input.__sourceVideo;
            return input;
        },
        normalize: data => {
            const statuses = { queued: 'queued', in_progress: 'running', completed: 'completed', failed: 'failed', nsfw: 'failed', canceled: 'canceled' } as const;
            if (!(data.status in statuses))
                throw new ProviderError('Unknown Higgsfield request status');
            return { taskId: data.request_id, status: statuses[data.status as keyof typeof statuses], outputs: mediaUrls(data), statusUrl: data.status_url, cancelUrl: data.cancel_url, error: data.error || (data.status === 'nsfw' ? 'Rejected by provider content moderation' : undefined) };
        },
        submit: async (mapping, input) => {
            let payload = input;
            if (mapping.modelId.startsWith('kling-video/'))
                payload = { prompt: input.prompt, duration: Number(input.duration || 5), cfg_scale: input.cfg_scale ?? 0.5, negative_prompt: input.negative_prompt || '', image_url: input.image_url || input.image_urls?.[0] };
            const result = adapter.normalize(await responseJson(await request(`https://api.higgsfield.ai/${mapping.modelId}`, payload)));
            if (!result.taskId || !result.statusUrl)
                throw new ProviderError('Higgsfield returned incomplete request metadata. Check provider history before retrying.');
            safeHiggsfieldUrl(result.statusUrl);
            if (result.cancelUrl)
                safeHiggsfieldUrl(result.cancelUrl);
            return result;
        },
        poll: async (job) => ({ ...adapter.normalize(await responseJson(await request(job.statusUrl || `https://api.higgsfield.ai/requests/${encodeURIComponent(job.taskId)}/status`))), statusUrl: job.statusUrl, cancelUrl: job.cancelUrl }),
        cancel: async (job) => { const response = await request(job.cancelUrl || `https://api.higgsfield.ai/requests/${encodeURIComponent(job.taskId)}/cancel`, {}); if (response.status !== 202)
            await responseJson(response); },
        health: async () => ({ state: 'configured', message: 'Credentials saved. Account access is verified on the next request; no paid test was submitted.' }),
    };
    return adapter;
}
