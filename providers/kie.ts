import { prepareKieInput } from './kie-input';
import { MODEL_REGISTRY, estimateCost } from '../src/models/registry';
import { mediaUrls, ProviderError, responseJson, type ProviderAdapter } from './types';
const veo = (id: string) => id === 'veo-3.1' || id.startsWith('veo/');
export function kieAdapter(key: () => string): ProviderAdapter {
    const request = async (endpoint: string, body?: any) => {
        if (!key())
            throw new ProviderError('Configure Kie credentials in Settings.', 401);
        const data = await responseJson(await fetch(`https://api.kie.ai/api/v1/${endpoint}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) }));
        if (data.code !== undefined && data.code !== 200)
            throw new ProviderError('Kie rejected the request. Check model inputs, credits and account access.', 400);
        return data;
    };
    const adapter: ProviderAdapter = {
        id: 'kie', catalog: () => MODEL_REGISTRY.filter(m => m.mappings.some(p => p.provider === 'kie')),
        estimate: (m, p, t, d) => estimateCost(m, 'kie', p, t, d),
        prepare: prepareKieInput,
        normalize: (payload, mapping) => {
            const data = payload.data || payload;
            const state = veo(mapping?.modelId || '') ? data.successFlag : data.state;
            const status = ['success', 'completed', 'succeeded', 1].includes(state) ? 'completed' : ['fail', 'failed', 'error', 2, 3].includes(state) ? 'failed' : state === 'waiting' || state === 'queued' ? 'queued' : 'running';
            const result = data.resultJson || data.resultUrls || data.response;
            return { taskId: data.taskId || '', status, outputs: mediaUrls(result), text: typeof result === 'string' ? result : JSON.stringify(result), error: status === 'failed' ? (data.failMsg || 'Kie generation failed') : undefined };
        },
        submit: async (mapping, input) => {
            const endpoint = veo(mapping.modelId) ? `veo/${mapping.modelId.startsWith('veo/') ? mapping.modelId.slice(4) : 'generate'}` : 'jobs/createTask';
            const data = await request(endpoint, veo(mapping.modelId) ? input : { model: mapping.modelId, input });
            if (!data.data?.taskId)
                throw new ProviderError('Kie returned no task ID. Check provider history before retrying.');
            return { taskId: data.data.taskId, status: 'queued', outputs: [] };
        },
        poll: async (job, mapping) => adapter.normalize(await request(`${veo(mapping.modelId) ? 'veo/record-info' : 'jobs/recordInfo'}?taskId=${encodeURIComponent(job.taskId)}`), mapping),
        health: async () => { await request('chat/credit'); return { state: 'connected', message: 'Kie credentials verified' }; },
    };
    return adapter;
}
