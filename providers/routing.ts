import { estimateCost, type ProviderId, type RegistryModel, type RoutingPolicy } from '../src/models/registry';
export function routeProvider(model: RegistryModel, input: Record<string, any>, policy: RoutingPolicy, manual: ProviderId | undefined, enabled: ProviderId[], priority: ProviderId[], latency: Partial<Record<ProviderId, number>> = {}) {
    const candidates = model.mappings.filter(m => enabled.includes(m.provider));
    if (policy === 'manual') {
        const mapping = candidates.find(m => m.provider === manual);
        if (!mapping)
            throw new Error('Selected provider is not configured or does not support this model');
        return mapping;
    }
    // A provider must accept every requested feature; the shared Kling mapping has no last-frame support.
    const compatible = candidates.filter(m => m.provider !== 'higgsfield' || !m.modelId.startsWith('kling-video/') || (!(input.image_urls?.length > 1) && !input.tail_image_url && !input.aspect_ratio));
    compatible.sort((a, b) => {
        if (policy === 'lowest-cost') {
            const ac = estimateCost(model, a.provider, input).usd ?? Infinity;
            const bc = estimateCost(model, b.provider, input).usd ?? Infinity;
            if (ac !== bc)
                return ac - bc;
        }
        if (policy === 'fastest' && latency[a.provider] != null && latency[b.provider] != null)
            return latency[a.provider]! - latency[b.provider]!;
        return priority.indexOf(a.provider) - priority.indexOf(b.provider);
    });
    if (!compatible.length)
        throw new Error(model.unavailableReason || 'Connect a compatible provider in Settings');
    return compatible[0];
}
