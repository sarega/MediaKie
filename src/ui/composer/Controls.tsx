import React from 'react';
import { compactParams, resolveModel, type RoutingPolicy } from '../../models/registry';
import type { AIModel } from '../../types';
export function ComposerControls({ model, values, onChange, onModels, onMore, policy, onPolicy, provider, onProvider }: {
    model: AIModel;
    values: Record<string, any>;
    onChange: (key: string, value: any) => void;
    onModels: () => void;
    onMore: () => void;
    policy: RoutingPolicy;
    onPolicy: (p: RoutingPolicy) => void;
    provider: string;
    onProvider: (p: string) => void;
}) {
    const registered = resolveModel(model);
    return <div className="flex flex-wrap gap-2 items-center text-xs">
 <button onClick={onModels} className="px-3 py-2 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-200">{model.name} ▾</button>
 <select aria-label="Provider routing" value={policy} onChange={e => onPolicy(e.target.value as RoutingPolicy)} className="bg-neutral-950 rounded-lg p-2 border border-neutral-700"><option value="auto">Provider: Auto</option><option value="manual">Manual provider</option><option value="lowest-cost">Lowest cost</option><option value="preferred">Preferred</option><option value="fastest">Fastest / preferred</option></select>
 {policy === 'manual' && <select aria-label="Generation provider" value={provider} onChange={e => onProvider(e.target.value)} className="bg-neutral-950 rounded-lg p-2">{registered.mappings.map(p => <option key={p.provider} value={p.provider}>{p.provider === 'kie' ? 'Kie.ai' : 'Higgsfield'}</option>)}</select>}
 {compactParams(model).map(p => <label key={p.key} className="flex items-center gap-2 px-2 py-1 rounded-lg border border-neutral-700 text-neutral-400">{p.name}{p.options ? <select aria-label={p.name} value={values[p.key] ?? p.defaultValue} onChange={e => onChange(p.key, p.options!.find(o => String(o.value) === e.target.value)!.value)} className="bg-neutral-900 text-neutral-100 max-w-28 py-1">{p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : p.type === 'boolean' ? <input type="checkbox" checked={values[p.key] ?? p.defaultValue} onChange={e => onChange(p.key, e.target.checked)}/> : <input aria-label={p.name} type="number" min={p.min} max={p.max} step={p.step} className="w-12 bg-neutral-900 text-neutral-100" value={values[p.key] ?? p.defaultValue} onChange={e => onChange(p.key, Number(e.target.value))}/>}</label>)}
 <button onClick={onMore} className="p-2 rounded-lg border border-neutral-700">More parameters</button>
 </div>;
}
