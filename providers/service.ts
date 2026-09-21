import fs from 'node:fs/promises';
import path from 'node:path';
import type { Express } from 'express';
import { MODEL_REGISTRY, findModel, validateParameters, parametersFor, type ProviderId, type RoutingPolicy } from '../src/models/registry';
import { kieAdapter } from './kie';
import { higgsfieldAdapter } from './higgsfield';
import { routeProvider } from './routing';
import { ProviderError, responseJson, type Job } from './types';
export async function installProviders(app: Express, dataDir: string, assertPublicUrl: (url: string) => Promise<URL>) {
    await fs.mkdir(dataDir, { recursive: true });
    const read = async (name: string, fallback: any) => { try {
        return JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8'));
    }
    catch (e: any) {
        if (e.code === 'ENOENT')
            return fallback;
        throw e;
    } };
    let writes = Promise.resolve();
    const write = (name: string, value: any) => {
        const snapshot = JSON.stringify(value, null, 2);
        const operation = writes.then(async () => { const filename = path.join(dataDir, name); await fs.writeFile(`${filename}.tmp`, snapshot, { mode: 0o600 }); await fs.rename(`${filename}.tmp`, filename); await fs.chmod(filename, 0o600); });
        writes = operation.catch(() => { });
        return operation;
    };
    let config = { ...{ keys: {} as Record<string, string>, policy: 'auto' as RoutingPolicy, priority: ['kie', 'higgsfield'] as ProviderId[], maxConcurrent: 3, limits: { kie: 3, higgsfield: 2 }, spendCap: null as number | null }, ...await read('providers.json', {}) };
    const kieKey = () => config.keys.kie || process.env.KIE_API_KEY || '';
    const hfKey = () => config.keys.higgsfield || process.env.HF_CREDENTIALS || (process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET ? `${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}` : '');
    const adapters = { kie: kieAdapter(kieKey), higgsfield: higgsfieldAdapter(hfKey) };
    const enabled = (): ProviderId[] => (['kie', 'higgsfield'] as const).filter(id => id === 'kie' ? !!kieKey() : !!hfKey());
    const publicConfig = () => ({ policy: config.policy, priority: config.priority, maxConcurrent: config.maxConcurrent, limits: config.limits, spendCap: config.spendCap, providers: (['kie', 'higgsfield'] as const).map(id => ({ id, configured: enabled().includes(id), state: enabled().includes(id) ? 'configured' : 'not-configured' })) });
    const jobs: Job[] = await read('generation-jobs.json', []);
    for (const job of jobs)
        if (job.status === 'submitting') {
            job.status = 'unknown';
            job.error = 'Server stopped during submission. Check provider history before retrying; this job will not be submitted twice.';
        }
    const saveJobs = () => write('generation-jobs.json', jobs);
    const safe = (handler: any) => async (req: any, res: any) => { try {
        await handler(req, res);
    }
    catch (e: any) {
        res.status(e instanceof ProviderError ? e.status : 400).json({ error: e.message || 'Generation service error', retryable: e.retryable || false });
    } };
    app.get('/api/providers', (_req, res) => res.json(publicConfig()));
    app.put('/api/providers', safe(async (req: any, res: any) => {
        const body = req.body;
        const next = { ...config, keys: { ...config.keys } };
        if (body.keys)
            for (const id of ['kie', 'higgsfield'])
                if (typeof body.keys[id] === 'string' && body.keys[id].trim()) {
                    if (body.keys[id].length > 4096 || /[\r\n]/.test(body.keys[id]))
                        throw new Error('Invalid credentials');
                    if (id === 'higgsfield' && !/^[^:]+:[^:]+$/.test(body.keys[id].trim()))
                        throw new Error('Higgsfield requires key ID and secret');
                    next.keys[id] = body.keys[id].trim();
                }
        if (body.policy !== undefined) {
            if (!['auto', 'manual', 'lowest-cost', 'preferred', 'fastest'].includes(body.policy))
                throw new Error('Invalid policy');
            next.policy = body.policy;
        }
        if (body.priority !== undefined) {
            if (!Array.isArray(body.priority) || body.priority.length !== 2 || new Set(body.priority).size !== 2 || body.priority.some((id: string) => !['kie', 'higgsfield'].includes(id)))
                throw new Error('Invalid provider priority');
            next.priority = body.priority;
        }
        if (body.maxConcurrent !== undefined) {
            if (!Number.isInteger(body.maxConcurrent) || body.maxConcurrent < 1 || body.maxConcurrent > 20)
                throw new Error('Concurrency must be 1–20');
            next.maxConcurrent = body.maxConcurrent;
        }
        if (body.limits !== undefined) {
            for (const id of ['kie', 'higgsfield'])
                if (!Number.isInteger(body.limits[id]) || body.limits[id] < 1 || body.limits[id] > 20)
                    throw new Error('Provider concurrency must be 1–20');
            next.limits = body.limits;
        }
        if (body.spendCap !== undefined) {
            if (body.spendCap !== null && (typeof body.spendCap !== 'number' || !Number.isFinite(body.spendCap) || body.spendCap <= 0))
                throw new Error('Spend cap must be positive');
            next.spendCap = body.spendCap;
        }
        await write('providers.json', next);
        config = next;
        res.json(publicConfig());
    }));
    app.post('/api/providers/:provider/check', safe(async (req: any, res: any) => { if (!enabled().includes(req.params.provider))
        throw new Error('Configure this provider first'); res.json(await adapters[req.params.provider as ProviderId].health()); }));
    app.get('/api/models', (_req, res) => res.json({ models: MODEL_REGISTRY }));
    function choose(body: any) {
        const model = findModel(body.logicalModel);
        if (!model)
            throw new Error('Unknown logical model');
        if (!body.input || typeof body.input !== 'object' || Array.isArray(body.input))
            throw new Error('Settings must be an object');
        if (body.sourceDuration !== undefined && (typeof body.sourceDuration !== 'number' || !Number.isFinite(body.sourceDuration) || body.sourceDuration < 0))
            throw new Error('Invalid source duration');
        const requestedPolicy = body.policy || config.policy;
        if (!['auto', 'manual', 'lowest-cost', 'preferred', 'fastest'].includes(requestedPolicy))
            throw new Error('Invalid routing policy');
        const mapping = routeProvider(model, body.input, requestedPolicy, body.provider || config.priority[0], enabled(), config.priority);
        validateParameters({ ...model, params: parametersFor(model, mapping.provider) }, body.input);
        if (mapping.provider === 'higgsfield' && mapping.modelId.startsWith('kling-video/') && (body.input.image_urls?.length > 1 || body.input.tail_image_url || body.input.aspect_ratio))
            throw new Error('Higgsfield Kling uses one input image and its aspect ratio; explicit ratio and last frame are unsupported');
        const estimate = adapters[mapping.provider].estimate(model, body.input, body.sourceType, body.sourceDuration);
        return { model, mapping, estimate };
    }
    app.post('/api/generation/estimate', safe(async (req: any, res: any) => { const { mapping, estimate } = choose(req.body); res.json({ provider: mapping.provider, cost: estimate, policy: req.body.policy || config.policy }); }));
    app.post('/api/generation/jobs', safe(async (req: any, res: any) => {
        if (req.body.historyId) {
            const existing = jobs.find(j => j.historyId === req.body.historyId && j.projectId === req.body.projectId);
            if (existing)
                return res.json(existing);
        }
        const { model, mapping, estimate } = choose(req.body);
        const input = req.body.input;
        if (!model.allowsPromptlessGeneration && !String(input.prompt || '').trim() && !model.id.startsWith('veo/get-'))
            throw new Error('Prompt is required');
        if (!/^[a-zA-Z0-9_-]+$/.test(req.body.projectId || ''))
            throw new Error('Project is required');
        const preparedInput = adapters[mapping.provider].prepare(model, input);
        if (config.spendCap !== null) {
            const reserved = jobs.reduce((sum, j) => sum + (j.finalCost?.usd ?? j.estimatedCost.usd ?? 0), 0);
            if (estimate.usd === null)
                throw new Error('Cannot enforce a spend cap with unknown pricing. Choose a model with verified pricing.');
            if (reserved + estimate.usd > config.spendCap)
                throw new Error('Local estimated spend cap reached');
        }
        const job: Job = { id: crypto.randomUUID(), historyId: typeof req.body.historyId === 'string' ? req.body.historyId : undefined, logicalModel: model.logicalId, provider: mapping.provider, mapping, prompt: input.prompt || '', settings: preparedInput, estimatedCost: estimate, taskId: '', status: 'queued', outputs: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), projectId: req.body.projectId };
        jobs.push(job);
        await saveJobs();
        res.status(202).json(job);
        void tick();
    }));
    app.get('/api/generation/jobs', (_req, res) => res.json({ jobs }));
    app.get('/api/generation/jobs/:id', safe(async (req: any, res: any) => { const job = jobs.find(j => j.id === req.params.id); if (!job)
        return res.status(404).json({ error: 'Job not found' }); res.json(job); }));
    app.post('/api/generation/jobs/:id/hide', safe(async (req: any, res: any) => { const job = jobs.find(j => j.id === req.params.id); if (!job)
        return res.status(404).json({ error: 'Job not found' }); job.hidden = true; await saveJobs(); res.json({ ok: true }); }));
    app.post('/api/generation/jobs/:id/stop', safe(async (req: any, res: any) => {
        const job = jobs.find(j => j.id === req.params.id);
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
        let remoteCanceled = false;
        if (job.taskId && ['queued', 'submitting', 'running', 'unknown'].includes(job.status) && adapters[job.provider].cancel) {
            try {
                await adapters[job.provider].cancel!(job);
                remoteCanceled = true;
            }
            catch {}
        }
        job.hidden = true;
        job.status = 'canceled';
        job.error = remoteCanceled ? 'Canceled by provider' : 'Stopped tracking locally';
        job.updatedAt = new Date().toISOString();
        await saveJobs();
        res.json({ ...job, remoteCanceled });
    }));
    app.post('/api/generation/jobs/:id/cancel', safe(async (req: any, res: any) => {
        const job = jobs.find(j => j.id === req.params.id);
        if (!job)
            return res.status(404).json({ error: 'Job not found' });
        if (job.status !== 'queued')
            throw new Error('Only queued jobs can be canceled');
        if (job.taskId) {
            const adapter = adapters[job.provider];
            if (!adapter.cancel)
                throw new Error('Provider cancellation is not supported');
            await adapter.cancel(job);
        }
        job.status = 'canceled';
        job.updatedAt = new Date().toISOString();
        await saveJobs();
        res.json(job);
    }));
    // Serial scheduler decisions prevent oversubscribing local/provider concurrency limits.
    let ticking = false;
    async function tick() {
        if (ticking)
            return;
        ticking = true;
        try {
            for (const job of jobs.filter(j => j.taskId && ['queued', 'running'].includes(j.status))) {
                try {
                    const result = await adapters[job.provider].poll(job, job.mapping);
                    if (job.status === 'canceled')
                        continue;
                    Object.assign(job, result, { taskId: job.taskId, updatedAt: new Date().toISOString() });
                    await saveJobs();
                }
                catch (e: any) {
                    job.error = e.message;
                    job.updatedAt = new Date().toISOString();
                    await saveJobs();
                }
            }
            for (const job of jobs.filter(j => !j.taskId && j.status === 'queued')) {
                if (job.status !== 'queued')
                    continue;
                const active = jobs.filter(j => ['submitting', 'unknown'].includes(j.status) || (j.taskId && ['queued', 'running'].includes(j.status)));
                if (active.length >= config.maxConcurrent || active.filter(j => j.provider === job.provider).length >= config.limits[job.provider])
                    continue;
                job.status = 'submitting';
                await saveJobs();
                try {
                    Object.assign(job, await adapters[job.provider].submit(job.mapping, job.settings));
                }
                catch (e: any) {
                    job.status = e instanceof ProviderError && e.status >= 400 && e.status < 500 ? 'failed' : 'unknown';
                    job.error = e.message;
                }
                job.updatedAt = new Date().toISOString();
                await saveJobs();
            }
        }
        catch (e) {
            console.error('Unable to persist generation queue', e instanceof Error ? e.message : 'Storage failure');
        }
        finally {
            ticking = false;
        }
    }
    const timer = setInterval(() => void tick(), 4000);
    timer.unref();
    void tick();
    app.post('/api/providers/higgsfield/upload', safe(async (req: any, res: any) => {
        const match = typeof req.body.dataUrl === 'string' && req.body.dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
        if (!match || !['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'audio/wav', 'audio/x-wav', 'video/mp4'].includes(match[1]))
            throw new Error('Unsupported Higgsfield input file');
        if (!hfKey())
            throw new ProviderError('Configure Higgsfield credentials', 401);
        const data = await responseJson(await fetch('https://api.higgsfield.ai/files/generate-upload-url', { method: 'POST', headers: { Authorization: `Key ${hfKey()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content_type: match[1] }), redirect: 'error', signal: AbortSignal.timeout(30000) }));
        const target = await assertPublicUrl(data.upload_url);
        if (target.protocol !== 'https:')
            throw new Error('Upload URL must use HTTPS');
        const response = await fetch(target, { method: 'PUT', headers: data.upload_headers, body: Buffer.from(match[2], 'base64'), redirect: 'error', signal: AbortSignal.timeout(60000) });
        if (!response.ok)
            throw new ProviderError('Higgsfield media upload failed');
        await assertPublicUrl(data.public_url);
        res.json({ url: data.public_url });
    }));
    return {
        kieKey,
        hideProjectJobs: async (projectId: string, historyIds?: string[]) => {
            const selected = historyIds ? new Set(historyIds) : null;
            let changed = false;
            for (const job of jobs) {
                if (job.projectId !== projectId || job.hidden || (selected && !selected.has(job.historyId || job.id)))
                    continue;
                job.hidden = true;
                if (job.status === 'queued')
                    job.status = 'canceled';
                job.updatedAt = new Date().toISOString();
                changed = true;
            }
            if (changed)
                await saveJobs();
        },
        close: () => clearInterval(timer),
    };
}
