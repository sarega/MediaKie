export interface KieTaskPollResult {
  completed: boolean;
  resultData?: unknown;
  taskData?: unknown;
}

interface PollOptions {
  taskId: string;
  isVeo: boolean;
  headers: HeadersInit;
  maxAttempts?: number;
  intervalMs?: number;
  onTransientError?: (message: string) => void;
}

const getStatusUrl = (taskId: string, isVeo: boolean) => isVeo
  ? `/api/kie/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`
  : `/api/kie/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;

class KieTaskFailure extends Error {}

export const pollKieTask = async ({
  taskId,
  isVeo,
  headers,
  maxAttempts = 300,
  intervalMs = 3000,
  onTransientError,
}: PollOptions): Promise<KieTaskPollResult> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    try {
      const response = await fetch(getStatusUrl(taskId, isVeo), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      if (!response.ok || !(data.code === 200 || data.msg === 'success' || Boolean(data.data))) {
        throw new Error(data.msg || data.error || 'Failed to query task status');
      }

      const state = isVeo ? data.data?.successFlag : data.data?.state;
      if (state === 'success' || state === 1 || state === 'completed' || state === 'succeeded') {
        return {
          completed: true,
          resultData: isVeo
            ? (data.data?.resultUrls || data.data?.response?.resultUrls)
            : (data.data?.resultJson || data.data?.resultUrls || data.data?.response),
          taskData: data.data,
        };
      }

      if (state === 'fail' || state === 'failed' || state === 2 || state === 3 || state === 'error') {
        throw new KieTaskFailure(data.data?.failMsg || 'Generation task failed');
      }
    } catch (error: any) {
      if (error instanceof KieTaskFailure) throw error;
      const message = error.message || 'Unable to check task status';
      onTransientError?.(message);
    }
  }

  return { completed: false };
};
