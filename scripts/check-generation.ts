import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installProviders } from '../providers/service';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-providers-'));
await fs.writeFile(path.join(directory, 'providers.json'), JSON.stringify({ keys: { higgsfield: 'fixture:secret' }, policy: 'auto', priority: ['higgsfield', 'kie'], maxConcurrent: 1, limits: { kie: 1, higgsfield: 1 }, spendCap: 1 }));
const nativeFetch = globalThis.fetch;
let submissions = 0;
let finish = false;
globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:'))
        return nativeFetch(url, options);
    assert.ok(String(url).startsWith('https://api.higgsfield.ai/'), 'No real external provider request may escape this fixture');
    if (String(url).endsWith('/status'))
        return new Response(JSON.stringify({ request_id: 'fixture', status: finish ? 'completed' : 'queued', ...(finish ? { images: [{ url: 'https://example.com/result.png' }] } : {}) }));
    submissions++;
    return new Response(JSON.stringify({ request_id: 'fixture', status: 'queued', status_url: 'https://api.higgsfield.ai/requests/fixture/status', cancel_url: 'https://api.higgsfield.ai/requests/fixture/cancel' }));
};
const app = express();
app.use(express.json());
let service = await installProviders(app, directory, async (url) => new URL(url));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address() as {
    port: number;
};
const base = `http://127.0.0.1:${address.port}`;
const request = async (route: string, body?: any, method = 'POST') => { const r = await fetch(base + route, body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const waitFor = async (check: () => Promise<boolean>) => { for (let n = 0; n < 120; n++) {
    if (await check())
        return;
    await new Promise(r => setTimeout(r, 100));
} throw new Error('Timed out waiting for queue'); };
try {
    const config = await request('/api/providers');
    assert.equal(config.status, 200);
    assert.ok(!JSON.stringify(config).includes('secret'));
    assert.equal((await request('/api/providers', { maxConcurrent: 0 }, 'PUT')).status, 400);
    const create = { logicalModel: 'soul-2:text-to-image', projectId: 'default', input: { prompt: 'fixture', resolution: '720p', batch_size: 1 } };
    const first = await request('/api/generation/jobs', create);
    assert.equal(first.status, 202);
    await waitFor(async () => submissions === 1);
    const second = await request('/api/generation/jobs', create);
    assert.equal(second.status, 202);
    const status = await request(`/api/generation/jobs/${second.body.id}`);
    assert.equal(status.body.status, 'queued');
    assert.equal(status.body.taskId, '');
    const cancel = await request(`/api/generation/jobs/${second.body.id}/cancel`, {});
    assert.equal(cancel.body.status, 'canceled');
    assert.equal(submissions, 1, 'Concurrency limit and cancel must prevent a second submission');
    finish = true;
    await waitFor(async () => (await request(`/api/generation/jobs/${first.body.id}`)).body.status === 'completed');
    const disk = JSON.parse(await fs.readFile(path.join(directory, 'generation-jobs.json'), 'utf8'));
    assert.equal(disk[0].outputs[0], 'https://example.com/result.png');
    assert.equal(disk[0].provider, 'higgsfield');
    assert.equal(disk[0].estimatedCost.kind, 'estimate');
    assert.equal(disk[0].finalCost, undefined);
    await request('/api/providers', { spendCap: 0.001 }, 'PUT');
    assert.equal((await request('/api/generation/jobs', create)).status, 400);
    const unknown = { ...create, logicalModel: 'soul-standard:text-to-image' };
    assert.match((await request('/api/generation/jobs', unknown)).body.error, /unknown pricing/);
    assert.equal((await request('/api/generation/jobs', { ...create, input: { prompt: 'fixture', batch_size: 3 } })).status, 400);
    assert.equal((await fs.stat(path.join(directory, 'providers.json'))).mode & 0o777, 0o600);
    service.close();
    // Restart in isolation with an interrupted submission: never automatically submit it again.
    disk[0].status = 'submitting';
    disk[0].taskId = '';
    await fs.writeFile(path.join(directory, 'generation-jobs.json'), JSON.stringify(disk));
    const restartApp = express();
    service = await installProviders(restartApp, directory, async (url) => new URL(url));
    assert.equal(submissions, 1);
    console.log('Generation service: durable jobs, connection redaction, queue limits, cancellation, spend caps and restart recovery passed.');
}
finally {
    service.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    globalThis.fetch = nativeFetch;
    await fs.rm(directory, { recursive: true, force: true });
}
