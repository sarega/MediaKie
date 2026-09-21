import { SUPPORTED_MODELS as KIE_MODELS, estimateModelCredits, type AIModel, type ModelParamConfig } from '../types';
export type ProviderId = 'kie' | 'higgsfield';
export type RoutingPolicy = 'auto' | 'manual' | 'lowest-cost' | 'preferred' | 'fastest';
export interface Cost {
    usd: number | null;
    credits?: number;
    kind: 'estimate' | 'final';
    source: string;
}
export interface Mapping {
    provider: ProviderId;
    modelId: string;
    source?: string;
    verifiedAt?: string;
    parameters?: ModelParamConfig[];
}
export interface RegistryModel extends AIModel {
    logicalId: string;
    mappings: Mapping[];
    unavailableReason?: string;
}
const select = (key: string, name: string, values: (string | number)[], defaultValue = values[0]): ModelParamConfig => ({ key, name, type: 'select', options: values.map(value => ({ label: String(value), value })), defaultValue });
const soulParams: ModelParamConfig[] = [
    select('aspect_ratio', 'Ratio', ['9:16', '16:9', '4:3', '3:4', '1:1', '2:3', '3:2'], '4:3'),
    select('resolution', 'Resolution', ['720p', '1080p']), select('batch_size', 'Count', [1, 4]),
    { key: 'seed', name: 'Seed', type: 'number', min: 1, max: 1000000, step: 1, defaultValue: '' },
    { key: 'style_id', name: 'Style ID', type: 'text', defaultValue: '' },
    { key: 'enhance_prompt', name: 'Enhance prompt', type: 'boolean', defaultValue: true },
];
const hfSource = (id: string) => `https://open.higgsfield.ai/models/${id}/api-reference`;
export const MODEL_REGISTRY: RegistryModel[] = KIE_MODELS.map(model => {
    const logicalId = `${[model.name, model.modeName].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${model.category}`;
    const mappings: Mapping[] = [{ provider: 'kie', modelId: model.id }];
    if (model.id === 'kling/2-5-turbo-image-to-video-pro')
        mappings.push({ provider: 'higgsfield', modelId: 'kling-video/v2.5-turbo/pro/image-to-video', source: hfSource('kling-video/v2.5-turbo/pro/image-to-video'), verifiedAt: '2026-09-21', parameters: [select('duration', 'Duration', [5, 10]), { key: 'cfg_scale', name: 'CFG', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5 }, { key: 'negative_prompt', name: 'Negative prompt', type: 'text', defaultValue: '' }] });
    return { ...model, logicalId, mappings };
});
MODEL_REGISTRY.push(...(['standard', 'v2/standard'] as const).map((variant): RegistryModel => {
    const id = `higgsfield-ai/soul/${variant}`;
    return { id, logicalId: variant === 'standard' ? 'soul-standard:text-to-image' : 'soul-2:text-to-image', name: variant === 'standard' ? 'Soul Standard' : 'Soul 2', provider: 'Higgsfield', familyId: 'soul', familyName: 'Soul', category: 'text-to-image', params: variant === 'standard' ? [...soulParams, { key: 'style_strength', name: 'Style strength', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 1 }] : soulParams, mappings: [{ provider: 'higgsfield', modelId: id, source: hfSource(id), verifiedAt: '2026-09-21' }] };
}));
MODEL_REGISTRY.push({ id: 'soul-cinema-unverified', logicalId: 'soul-cinema:text-to-image', name: 'Soul Cinema', provider: 'Higgsfield', familyId: 'soul', familyName: 'Soul', category: 'text-to-image', mappings: [], unavailableReason: 'Awaiting verified model-specific API schema. No endpoint is assumed.' });
export const findModel = (logicalId: string) => MODEL_REGISTRY.find(m => m.logicalId === logicalId);
export const resolveModel = (model: AIModel) => MODEL_REGISTRY.find(m => m.id === model.id && m.category === model.category)!;
export const defaultsFor = (model: AIModel) => Object.fromEntries((model.params || []).map(p => [p.key, p.defaultValue]));
export const compactParams = (model: AIModel) => (model.params || []).filter(p => /^(aspect_ratio|resolution|quality|duration|sound|audio|generate_audio|enable_audio|num_images|num_outputs|batch_size)$/.test(p.key));
export function parametersFor(model: AIModel, provider?: ProviderId): ModelParamConfig[] {
    const registered = resolveModel(model);
    if (!registered)
        return model.params || [];
    if (provider)
        return registered.mappings.find(m => m.provider === provider)?.parameters || registered.params || [];
    return (registered.params || []).filter(p => registered.mappings.every(m => !m.parameters || m.parameters.some(other => other.key === p.key)));
}
export function capabilitiesFor(model: AIModel) {
    const parameters = model.params || [];
    const matching = (pattern: RegExp) => parameters.filter(p => pattern.test(p.key));
    return {
        modality: model.category.includes('video') ? 'video' : model.category === 'text-to-text' ? 'text' : 'image',
        workflow: model.category, inputs: ['text', ...(model.supportsImageUpload ? ['image'] : []), ...(model.supportsVideoUpload ? ['video'] : [])],
        parameters, imageInputKey: model.imageInputKey, videoInputKey: model.videoInputKey,
        referenceImages: matching(/reference.*image|image.*reference/), firstFrame: matching(/first_frame|start_frame/), lastFrame: matching(/last_frame|end_frame|tail_image/),
        aspectRatios: matching(/aspect_ratio|^ratio$/), resolutions: matching(/resolution|quality/), duration: matching(/duration|length/),
        audio: matching(/audio|sound/), seed: matching(/seed/), cfg: matching(/cfg|guidance/), negativePrompt: matching(/negative_prompt/),
        motion: matching(/motion/), camera: matching(/camera/), outputCount: matching(/num_images|num_outputs|batch_size/),
    };
}
export function estimateCost(model: RegistryModel, provider: ProviderId, params: Record<string, any>, sourceType?: 'image' | 'video', sourceDuration?: number): Cost {
    if (provider === 'kie') {
        const credits = estimateModelCredits(model, { ...defaultsFor(model), ...params }, sourceType, sourceDuration);
        return { usd: credits == null ? null : credits * 0.005, ...(credits == null ? {} : { credits }), kind: 'estimate', source: 'Existing Kie public pricing metadata; $0.005/credit' };
    }
    if (model.logicalId === 'soul-2:text-to-image')
        return { usd: (params.resolution === '1080p' ? 0.0057 : 0.0032) * Number(params.batch_size || 1), kind: 'estimate', source: 'Higgsfield Soul 2 public pricing, 2026-09-21' };
    if (model.logicalId === 'soul-standard:text-to-image')
        return { usd: null, kind: 'estimate', source: 'Public Soul Standard pricing conflicts; verify in console' };
    return { usd: 0.07 * Number(params.duration || 5), kind: 'estimate', source: 'Higgsfield Kling 2.5 Pro public pricing, 2026-09-21' };
}
export function validateParameters(model: RegistryModel, input: Record<string, any>) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Settings must be an object');
    for (const p of model.params || []) {
        const value = input[p.key];
        if (value == null || value === '')
            continue;
        if (p.options && !p.options.some(o => String(o.value) === String(value)))
            throw new Error(`Invalid ${p.name}`);
        if (['number', 'slider'].includes(p.type) && (!Number.isFinite(Number(value)) || (p.min != null && Number(value) < p.min) || (p.max != null && Number(value) > p.max)))
            throw new Error(`Invalid ${p.name}`);
        if (p.type === 'boolean' && typeof value !== 'boolean')
            throw new Error(`Invalid ${p.name}`);
    }
}
