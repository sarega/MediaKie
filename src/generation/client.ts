export async function jsonRequest(url: string, body?: unknown) {
    const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error || 'Request failed');
    return data;
}
export const isStaleGeneration = (timestamp: string, now = Date.now(), maxAgeMs = 2 * 60 * 60 * 1000) => {
    const startedAt = new Date(timestamp).getTime();
    return Number.isFinite(startedAt) && now - startedAt >= maxAgeMs;
};
export async function pollGeneration(id: string, onTransientError?: (message: string) => void, onUpdate?: (job: any) => void) {
    for (let n = 0; n < 300; n++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        let job;
        try {
            job = await jsonRequest(`/api/generation/jobs/${encodeURIComponent(id)}`);
        }
        catch (e: any) {
            onTransientError?.(e.message);
            continue;
        }
        onUpdate?.(job);
        if (job.status === 'completed')
            return { completed: true, resultData: job.outputs.length ? job.outputs : job.text, taskData: job };
        if (['failed', 'canceled', 'unknown'].includes(job.status))
            throw new Error(job.error || `Generation ${job.status}`);
    }
    return { completed: false, resultData: undefined, taskData: undefined };
}
