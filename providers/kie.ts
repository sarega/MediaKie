import { prepareKieInput } from './kie-input';
import { MODEL_REGISTRY, estimateCost, type Mapping } from '../src/models/registry';
import { mediaUrls, ProviderError, responseJson, type Job, type ProviderAdapter } from './types';
const legacyVeo = (mapping?: Mapping) => mapping?.apiVersion !== 'market' && (mapping?.modelId === 'veo-3.1' || mapping?.modelId.startsWith('veo/'));
export function kieAdapter(key: () => string): ProviderAdapter {
    const request = async (endpoint: string, body?: any) => {
        if (!key()) throw new ProviderError('Configure Kie credentials in Settings.', 401);
        const data = await responseJson(await fetch(`https://api.kie.ai/api/v1/${endpoint}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) }));
        if (data.code !== undefined && data.code !== 200) throw new ProviderError('Kie rejected the request. Check model inputs, credits and account access.', 400);
        return data;
    };
    const adapter: ProviderAdapter = {
        id: 'kie', catalog: () => MODEL_REGISTRY.filter(m => m.mappings.some(p => p.provider === 'kie')),
        estimate: (m, p, t, d) => estimateCost(m, 'kie', p, t, d),
        prepare: prepareKieInput,
        normalize: (payload, mapping) => {
            const data = payload.data || payload;
            const state = legacyVeo(mapping) ? data.successFlag : data.state;
            const status = ['success', 'completed', 'succeeded', 1].includes(state) ? 'completed' : ['fail', 'failed', 'error', 2, 3].includes(state) ? 'failed' : state === 'waiting' || state === 'queued' ? 'queued' : 'running';
            const result = data.resultJson || data.resultUrls || data.response;
            const credits = data.creditsConsumed;
            return { taskId: data.taskId || '', status, outputs: mediaUrls(result), text: typeof result === 'string' ? result : JSON.stringify(result), error: status === 'failed' ? (data.failMsg || 'Kie generation failed') : undefined,
                ...(status === 'completed' && typeof credits === 'number' && Number.isFinite(credits) && credits >= 0 ? {finalCost:{credits,usd:credits*0.005,kind:'final' as const,source:'Kie recordInfo creditsConsumed'}} : {}) };
        },
        submit: async (mapping, input) => {
            const legacy = legacyVeo(mapping);
            const {callBackUrl, ...settings} = input;
            const endpoint = legacy ? `veo/${mapping.modelId.startsWith('veo/') ? mapping.modelId.slice(4) : 'generate'}` : 'jobs/createTask';
            const data = await request(endpoint, legacy ? input : { model: mapping.modelId, input: settings, ...(callBackUrl ? {callBackUrl} : {}) });
            // Some upgrade calls return the completed URL immediately instead of another task.
            const outputs = mediaUrls(data.data?.resultUrl || data.data?.resultUrls);
            if (!data.data?.taskId && outputs.length) return {taskId: input.taskId || '', status:'completed', outputs};
            if (!data.data?.taskId) throw new ProviderError('Kie returned no task ID. Check provider history before retrying.');
            return { taskId: data.data.taskId, status: 'queued', outputs: [] };
        },
        poll: async (job, mapping) => {
            const payload = await request(`${legacyVeo(mapping) ? 'veo/record-info' : 'jobs/recordInfo'}?taskId=${encodeURIComponent(job.taskId)}`);
            const result = adapter.normalize(payload, mapping);
            if (mapping.apiVersion === 'market' && mapping.modelId === 'veo-3-1' && result.status === 'completed') {
                let data = payload.data?.resultJson || payload.data?.response;
                if (typeof data === 'string') {try {data = JSON.parse(data);} catch {data = null;}}
                const resolution = (job as Job).settings?.resolution;
                if (data?.data && (resolution === '4k' || resolution === '1080p')) {
                    result.outputs = mediaUrls(data.data.result_urls);
                    if (!result.outputs.length) result.status = 'running'; // origin_urls is only the 720p preview.
                }
            }
            return result;
        },
        health: async () => { await request('chat/credit'); return { state: 'connected', message: 'Kie credentials verified' }; },
    };
    return adapter;
}
