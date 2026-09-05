import assert from 'node:assert/strict';
import { pollKieTask } from '../src/lib/kieTaskPolling';

const originalFetch = globalThis.fetch;
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

try {
  let calls = 0;
  let transientErrors = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new Error('network down');
    if (calls === 2) return jsonResponse({ code: 200, data: { state: 'processing' } });
    return jsonResponse({ code: 200, data: { state: 'success', resultJson: { id: 'result-1' } } });
  }) as typeof fetch;

  const recovered = await pollKieTask({
    taskId: 'fixture-retry',
    isVeo: false,
    headers: {},
    intervalMs: 0,
    maxAttempts: 3,
    onTransientError: () => { transientErrors += 1; },
  });
  assert.equal(recovered.completed, true);
  assert.deepEqual(recovered.resultData, { id: 'result-1' });
  assert.equal(transientErrors, 1);

  globalThis.fetch = (async () => jsonResponse({ code: 200, data: { state: 'failed', failMsg: 'provider rejected task' } })) as typeof fetch;
  await assert.rejects(
    pollKieTask({ taskId: 'fixture-failure', isVeo: false, headers: {}, intervalMs: 0, maxAttempts: 1 }),
    /provider rejected task/,
  );

  globalThis.fetch = (async () => jsonResponse({ code: 200, data: { state: 'processing' } })) as typeof fetch;
  const timedOut = await pollKieTask({ taskId: 'fixture-timeout', isVeo: false, headers: {}, intervalMs: 0, maxAttempts: 2 });
  assert.equal(timedOut.completed, false);
  console.log('check:polling passed');
} finally {
  globalThis.fetch = originalFetch;
}
