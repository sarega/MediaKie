import React, { useEffect, useState } from 'react';
import type { AppTheme } from '../types';
import { jsonRequest } from '../generation/client';
interface Props {
    isOpen: boolean;
    autoplayVideos: boolean;
    theme: AppTheme;
    onClose: () => void;
    onSaveSettings: (autoplay: boolean, theme: AppTheme) => void;
}
export function SettingsModal({ isOpen, autoplayVideos, theme, onClose, onSaveSettings }: Props) {
    const [config, setConfig] = useState<any>(null);
    const [kie, setKie] = useState('');
    const [hfId, setHfId] = useState('');
    const [hfSecret, setHfSecret] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [checks, setChecks] = useState<Record<string, string>>({});
    const [autoplay, setAutoplay] = useState(autoplayVideos);
    const [appearance, setAppearance] = useState(theme);
    useEffect(() => { if (isOpen) {
        setConfig(null);
        setError('');
        setKie('');
        setHfId('');
        setHfSecret('');
        setAutoplay(autoplayVideos);
        setAppearance(theme);
        jsonRequest('/api/providers').then(setConfig).catch(e => setError(e.message));
    } }, [isOpen]);
    if (!isOpen)
        return null;
    const field = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 mt-1 text-sm';
    async function save() {
        setSaving(true);
        setError('');
        try {
            if (Boolean(hfId) !== Boolean(hfSecret))
                throw new Error('Enter both Higgsfield key ID and secret');
            const response = await fetch('/api/providers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, keys: { kie, ...(hfId && hfSecret ? { higgsfield: `${hfId}:${hfSecret}` } : {}) } }) });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error);
            localStorage.removeItem('kie_client_api_key');
            localStorage.setItem('kie_autoplay_videos', String(autoplay));
            localStorage.setItem('kie_theme', appearance);
            setKie('');
            setHfId('');
            setHfSecret('');
            window.dispatchEvent(new Event('studio-providers-changed'));
            onSaveSettings(autoplay, appearance);
            onClose();
        }
        catch (e: any) {
            setError(e.message);
        }
        finally {
            setSaving(false);
        }
    }
    return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true" aria-label="Settings" onKeyDown={e => { if (e.key === 'Escape')
        onClose(); }}><div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-neutral-700 bg-neutral-900 p-6">
 <div className="flex justify-between mb-5"><h2 className="text-xl font-semibold">Settings</h2><button autoFocus onClick={onClose} aria-label="Close settings">✕</button></div>
 <div className="overflow-y-auto space-y-6 pr-1">{error && <p role="alert" className="text-red-300">{error}</p>}{!config ? <p className="text-neutral-400">Loading provider settings…</p> : <>
 <section><h3 className="font-semibold mb-3">Providers</h3><p className="text-xs text-neutral-500 mb-4">Secrets are stored on this computer’s server, never returned to the browser. Leave fields empty to retain existing credentials.</p>
 {(['kie', 'higgsfield'] as const).map(id => <div key={id} className="rounded-xl border border-neutral-800 p-4 mb-3"><div className="flex justify-between"><h4>{id === 'kie' ? 'Kie.ai' : 'Higgsfield'}</h4><span className="text-xs text-neutral-400">{config.providers.find((p: any) => p.id === id)?.configured ? 'Credentials configured' : 'Not configured'}</span></div>
 {id === 'kie' ? <label className="block mt-3 text-xs text-neutral-400">API key<input type="password" autoComplete="new-password" className={field} value={kie} onChange={e => setKie(e.target.value)}/></label> : <div className="grid sm:grid-cols-2 gap-3 mt-3"><label className="text-xs text-neutral-400">Key ID<input type="password" autoComplete="new-password" className={field} value={hfId} onChange={e => setHfId(e.target.value)}/></label><label className="text-xs text-neutral-400">Key secret<input type="password" autoComplete="new-password" className={field} value={hfSecret} onChange={e => setHfSecret(e.target.value)}/></label></div>}
 <div className="mt-3 flex gap-3 items-center"><label className="text-xs text-neutral-400">Concurrent jobs <input type="number" min="1" max="20" className="w-16 rounded bg-neutral-950 p-1 ml-2" value={config.limits[id]} onChange={e => setConfig({ ...config, limits: { ...config.limits, [id]: Number(e.target.value) } })}/></label><button className="text-xs text-violet-300" onClick={() => { jsonRequest(`/api/providers/${id}/check`, {}).then(r => setChecks({ ...checks, [id]: r.message })).catch(e => setChecks({ ...checks, [id]: e.message })); }}>Check saved connection</button></div>{checks[id] && <p className="text-xs text-neutral-400 mt-2">{checks[id]}</p>}</div>)}
 </section><section><h3 className="font-semibold mb-3">Generation defaults</h3><div className="grid sm:grid-cols-2 gap-4 text-sm"><label>Provider selection<select className={field} value={config.policy} onChange={e => setConfig({ ...config, policy: e.target.value })}><option value="auto">Auto</option><option value="manual">Manual</option><option value="lowest-cost">Lowest cost</option><option value="preferred">Preferred</option><option value="fastest">Fastest / preferred</option></select></label><label>Preferred provider<select className={field} value={config.priority[0]} onChange={e => setConfig({ ...config, priority: e.target.value === 'kie' ? ['kie', 'higgsfield'] : ['higgsfield', 'kie'] })}><option value="kie">Kie.ai</option><option value="higgsfield">Higgsfield</option></select></label><label>Maximum concurrent jobs<input className={field} type="number" min="1" max="20" value={config.maxConcurrent} onChange={e => setConfig({ ...config, maxConcurrent: Number(e.target.value) })}/></label><label>Local estimated spend cap (USD)<input className={field} type="number" min="0.01" step="0.01" placeholder="No cap" value={config.spendCap ?? ''} onChange={e => setConfig({ ...config, spendCap: e.target.value === '' ? null : Number(e.target.value) })}/></label></div><p className="text-xs text-neutral-500 mt-3">Fastest uses provider priority until latency data exists. The cap covers all jobs submitted through this installation, reserves estimates, and blocks unknown prices; it is not an account billing limit.</p></section>
 <section className="flex flex-wrap gap-6 text-sm"><label>Theme<select className={field} value={appearance} onChange={e => setAppearance(e.target.value as AppTheme)}><option value="dark">Dark</option><option value="light">Light</option></select></label><label className="flex items-center gap-2"><input type="checkbox" checked={autoplay} onChange={e => setAutoplay(e.target.checked)}/>Autoplay video results</label></section>
 </>}</div><div className="flex justify-end gap-3 mt-5 pt-4 border-t border-neutral-800"><button onClick={onClose} className="px-4 py-2 text-neutral-400">Cancel</button><button onClick={save} disabled={!config || saving} className="px-4 py-2 bg-violet-600 rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save settings'}</button></div>
 </div></div>;
}
