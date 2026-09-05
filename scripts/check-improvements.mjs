import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kie-media-studio-check-'));
const port = 32000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
await cp(path.join(repoDir, 'dist'), path.join(tempDir, 'dist'), { recursive: true });
const server = spawn(process.execPath, [path.join(repoDir, 'dist/server.cjs')], {
  cwd: tempDir,
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let startupOutput = '';
const started = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Timed out waiting for test server: ${startupOutput}`)), 10_000);
  const onOutput = (chunk) => {
    startupOutput += chunk.toString();
    if (startupOutput.includes(`Server running on http://127.0.0.1:${port}`)) {
      clearTimeout(timeout);
      resolve();
    }
  };
  server.stdout.on('data', onOutput);
  server.stderr.on('data', onOutput);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Test server exited with code ${code}: ${startupOutput}`)));
});

const request = async (route, options = {}) => {
  const response = await fetch(`${baseUrl}${route}`, options);
  const raw = await response.text();
  let body = raw;
  try {
    body = JSON.parse(raw);
  } catch {}
  return { response, body };
};

const jsonOptions = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const makeLog = (id, mediaUrl) => ({
  id,
  timestamp: new Date().toISOString(),
  modelId: 'fixture/model',
  modelName: 'Fixture model',
  provider: 'Fixture',
  prompt: id,
  status: 'success',
  type: 'image',
  ...(mediaUrl ? { mediaUrl, mediaUrls: [mediaUrl] } : {}),
});

try {
  await started;
  assert.match(startupOutput, /127\.0\.0\.1/);

  const homepage = await request('/');
  assert.equal(homepage.response.status, 200);
  const assetPath = homepage.body.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(assetPath, 'Production HTML should reference a JavaScript asset');
  const asset = await request(assetPath);
  assert.equal(asset.response.status, 200);
  assert.match(asset.response.headers.get('content-type') || '', /javascript/);

  const projects = await request('/api/projects');
  assert.equal(projects.response.status, 200);

  const created = await request('/api/projects', jsonOptions('POST', { name: 'Improvement fixture' }));
  assert.equal(created.response.status, 200);
  const projectId = created.body.project.id;

  const concurrentLogs = ['one', 'two', 'three'].map((id) => makeLog(`concurrent-${id}`));
  const concurrentResponses = await Promise.all(concurrentLogs.map((log) => request(
    `/api/projects/${projectId}/history/${log.id}`,
    jsonOptions('PUT', { log }),
  )));
  concurrentResponses.forEach(({ response }) => assert.equal(response.status, 200));
  const afterConcurrentWrites = await request(`/api/projects/${projectId}/history`);
  assert.equal(afterConcurrentWrites.body.logs.length, concurrentLogs.length);

  const libraryDir = path.join(tempDir, 'data', 'projects', projectId, 'library');
  await mkdir(libraryDir, { recursive: true });
  const sharedFilename = 'shared-fixture.png';
  const sharedPath = path.join(libraryDir, sharedFilename);
  await writeFile(sharedPath, 'fixture');
  const sharedUrl = `/projects/${projectId}/library/${sharedFilename}`;
  const servedProjectFile = await request(sharedUrl);
  assert.equal(servedProjectFile.response.status, 200);
  const sharedLogs = [makeLog('shared-a', sharedUrl), makeLog('shared-b', sharedUrl)];
  for (const log of sharedLogs) {
    const saved = await request(`/api/projects/${projectId}/history/${log.id}`, jsonOptions('PUT', { log }));
    assert.equal(saved.response.status, 200);
  }

  const removedFirst = await request(`/api/projects/${projectId}/history/shared-a`, { method: 'DELETE' });
  assert.equal(removedFirst.response.status, 200);
  await access(sharedPath);
  const afterFirstDelete = await request(`/api/projects/${projectId}/history`);
  assert.ok(afterFirstDelete.body.logs.some((log) => log.id === 'shared-b'));

  const removedSecond = await request(`/api/projects/${projectId}/history/shared-b`, { method: 'DELETE' });
  assert.equal(removedSecond.response.status, 200);
  await assert.rejects(access(sharedPath));

  const blocked = await request('/api/library/save-url', jsonOptions('POST', { url: `${baseUrl}/private-fixture.png`, type: 'image' }));
  assert.equal(blocked.response.status, 400);
  assert.match(blocked.body.error, /Private network|Local media/);

  const unsupported = await request('/api/library/save-url', jsonOptions('POST', { url: 'file:///tmp/fixture.png', type: 'image' }));
  assert.equal(unsupported.response.status, 400);

  const malformedDataUrl = await request('/api/download?url=data%3Aimage%2Fpng%3Bbase64%2Anot-base64');
  assert.equal(malformedDataUrl.response.status, 400);

  console.log('check:improvements passed');
} finally {
  server.kill('SIGTERM');
  await rm(tempDir, { recursive: true, force: true });
}
