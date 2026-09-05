import { GenerationLog } from '../types';

type HistoryOperation = () => Promise<void>;

export const createHistoryApi = () => {
  let queue = Promise.resolve();
  const enqueue = (operation: HistoryOperation) => {
    const queued = queue.catch(() => {}).then(operation);
    queue = queued.catch(() => {});
    return queued;
  };
  const url = (path: string) => new URL(path, window.location.origin).toString();

  const saveLog = (projectId: string, log: GenerationLog) => enqueue(async () => {
    const response = await fetch(url(`/api/projects/${encodeURIComponent(projectId)}/history/${encodeURIComponent(log.id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save history');
    }
  });

  const deleteLog = (projectId: string, id: string) => enqueue(async () => {
    const response = await fetch(url(`/api/projects/${encodeURIComponent(projectId)}/history/${encodeURIComponent(id)}`), { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to remove history item');
    }
  });

  const clear = (projectId: string) => enqueue(async () => {
    const response = await fetch(url(`/api/projects/${encodeURIComponent(projectId)}/history`), { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Failed to clear project');
  });

  return { saveLog, deleteLog, clear };
};
