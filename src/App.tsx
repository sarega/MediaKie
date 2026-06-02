/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ModelSidebar } from './components/ModelSidebar';
import { MediaWorkspace } from './components/MediaWorkspace';
import { ActivityLog } from './components/ActivityLog';
import { SettingsModal } from './components/SettingsModal';
import { SUPPORTED_MODELS, GenerationLog, AIModel } from './types';
import { LayoutGrid, X } from 'lucide-react';

const arrayUrlParams = new Set(['image_urls', 'input_urls', 'image_input', 'reference_image_urls', 'reference_video_urls', 'reference_audio_urls', 'video_urls']);
type SourceAsset = { id: string; type: 'image' | 'video'; url: string; label?: string };

const compactInput = (input: Record<string, any>) => {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === '' || value === null || value === undefined) return false;
      if (Array.isArray(value)) return value.length > 0 && value.some(Boolean);
      return true;
    })
  );
};

const isKieSuccessResponse = (response: Response, data: any) => {
  return response.ok && (data.code === 200 || data.msg === 'success' || Boolean(data.data));
};

const normalizeResultUrls = (result: any): string[] => {
  if (!result) return [];

  let parsed = result;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return parsed.startsWith('http') || parsed.startsWith('/library/') ? [parsed] : [];
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => normalizeResultUrls(item));
  }

  if (typeof parsed === 'object') {
    const directUrl = parsed.url || parsed.fileUrl || parsed.downloadUrl;
    if (typeof directUrl === 'string') return [directUrl];

    for (const key of ['resultUrls', 'urls', 'imageUrls', 'images', 'videoUrls', 'videos', 'output']) {
      const urls = normalizeResultUrls(parsed[key]);
      if (urls.length > 0) return urls;
    }
  }

  return [];
};

const assignModelImageInput = (inputPayload: Record<string, any>, model: AIModel, imageUrl: string) => {
  if (!model.imageInputKey) return false;
  inputPayload[model.imageInputKey] = model.imageInputMode === 'single' ? imageUrl : [imageUrl];
  return true;
};

const assignModelVideoInput = (inputPayload: Record<string, any>, model: AIModel, videoUrl: string) => {
  if (!model.videoInputKey) return false;
  inputPayload[model.videoInputKey] = model.videoInputMode === 'array' ? [videoUrl] : videoUrl;
  return true;
};

const signatureValue = (value: any): any => {
  if (typeof value === 'string') {
    if (value.length > 256) {
      return `${value.length}:${value.slice(0, 96)}:${value.slice(-96)}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(signatureValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, signatureValue(value[key])])
    );
  }
  return value;
};

const buildGenerationSignature = (
  model: AIModel,
  prompt: string,
  imageBase64?: string,
  videoBase64?: string,
  params?: Record<string, any>
) => JSON.stringify({
  modelId: model.id,
  category: model.category,
  prompt: prompt.trim(),
  image: signatureValue(imageBase64 || ''),
  video: signatureValue(videoBase64 || ''),
  params: signatureValue(params || {}),
});

export default function App() {
  const [selectedModel, setSelectedModel] = useState<AIModel>(SUPPORTED_MODELS[0]);
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [credits, setCredits] = useState<number | string | null>(null);
  const [creditError, setCreditError] = useState('');
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyBackfilled, setHistoryBackfilled] = useState(false);
  const [sourceAsset, setSourceAsset] = useState<SourceAsset | null>(null);
  const [frameGrabber, setFrameGrabber] = useState<{ url: string; time: number; duration: number } | null>(null);
  const [isCreateTaskPending, setIsCreateTaskPending] = useState(false);
  const lastPersistedLogsRef = useRef('');
  const activePollsRef = useRef(new Set<string>());
  const createTaskInFlightRef = useRef(false);
  const lastSubmissionRef = useRef<{ signature: string; timestamp: number } | null>(null);
  const frameVideoRef = useRef<HTMLVideoElement>(null);

  const getKieHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const clientKey = localStorage.getItem('kie_client_api_key');
    if (clientKey) {
      headers.Authorization = `Bearer ${clientKey}`;
    }
    return headers;
  };

  const fetchCredits = async () => {
    setIsLoadingCredits(true);
    setCreditError('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const clientKey = localStorage.getItem('kie_client_api_key');
      if (clientKey) {
        headers.Authorization = `Bearer ${clientKey}`;
      }

      const res = await fetch('/api/kie/api/v1/chat/credit', {
        method: 'GET',
        headers,
      });
      const data = await res.json();

      if (!res.ok || data.code !== 200) {
        throw new Error(data.msg || data.error || 'Unable to fetch credits');
      }

      setCredits(data.data);
    } catch (error: any) {
      setCredits(null);
      setCreditError(error.message || 'Unable to fetch credits');
    } finally {
      setIsLoadingCredits(false);
    }
  };

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch('/api/history');
        const data = await res.json();
        const serverLogs = Array.isArray(data.logs) ? data.logs : [];
        if (serverLogs.length > 0) {
          lastPersistedLogsRef.current = JSON.stringify(serverLogs);
          setLogs(serverLogs);
          return;
        }
      } catch (error) {
        console.warn('Failed to load server history, falling back to browser storage.', error);
      }

      try {
        const saved = localStorage.getItem('kie_media_logs');
        if (saved) {
          const savedLogs = JSON.parse(saved);
          lastPersistedLogsRef.current = JSON.stringify(savedLogs);
          setLogs(savedLogs);
        }
      } catch {}
    };

    loadHistory().finally(() => setHistoryLoaded(true));
    fetchCredits();
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    const serializedLogs = JSON.stringify(logs);
    if (serializedLogs === lastPersistedLogsRef.current) return;
    lastPersistedLogsRef.current = serializedLogs;
    localStorage.setItem('kie_media_logs', serializedLogs);
    fetch('/api/history', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs }),
    }).catch((error) => console.warn('Failed to persist server history.', error));
  }, [logs, historyLoaded]);

  useEffect(() => {
    if (!historyLoaded) return;

    setLogs((prev) => prev.map((log) => {
      if (log.status !== 'generating' || log.taskId) return log;
      const ageMs = Date.now() - new Date(log.timestamp).getTime();
      if (ageMs < 60_000) return log;
      return {
        ...log,
        status: 'failed',
        error: 'Generation was interrupted before the task ID was saved. Please generate it again.',
      };
    }));
  }, [historyLoaded]);

  const saveGeneratedMedia = async (url: string, type: 'image' | 'video') => {
    try {
      const res = await fetch('/api/library/save-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type }),
      });
      const data = await res.json();
      return res.ok && data.url ? data.url : url;
    } catch (error) {
      console.warn('Failed to save generated media locally.', error);
      return url;
    }
  };

  useEffect(() => {
    if (!historyLoaded || historyBackfilled || logs.length === 0) return;

    const backfillRemoteMedia = async () => {
      let changed = false;
      const updatedLogs = await Promise.all(logs.map(async (log) => {
        if (log.status !== 'success') return log;
        const urls = (log.mediaUrls && log.mediaUrls.length > 0 ? log.mediaUrls : [log.mediaUrl]).filter(Boolean) as string[];
        if (urls.length === 0 || urls.every((url) => url.startsWith('/library/') || url.startsWith('data:'))) return log;

        const localUrls = await Promise.all(urls.map((url) => saveGeneratedMedia(url, log.type)));
        if (localUrls.some((url, index) => url !== urls[index])) {
          changed = true;
          return { ...log, mediaUrl: localUrls[0], mediaUrls: localUrls };
        }
        return log;
      }));

      if (changed) {
        setLogs(updatedLogs);
      }
      setHistoryBackfilled(true);
    };

    backfillRemoteMedia();
  }, [historyLoaded, historyBackfilled, logs]);

  const extractFrameFromVideo = (url: string) => {
    return new Promise<string>((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      let settled = false;

      const cleanup = () => {
        video.pause();
        video.removeAttribute('src');
        video.load();
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(message));
      };

      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onerror = () => fail('Unable to load this video for frame extraction.');
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        video.currentTime = Math.max(0, duration - 0.2);
      };
      video.onseeked = () => {
        if (settled) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width || !canvas.height) {
          fail('Unable to read a video frame.');
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        settled = true;
        const dataUrl = canvas.toDataURL('image/png');
        cleanup();
        resolve(dataUrl);
      };
      video.src = url;
      video.load();
    });
  };

  const useAsSource = (asset: { type: 'image' | 'video'; url: string; label?: string }) => {
    setSourceAsset({ ...asset, id: crypto.randomUUID() });
  };

  const handleGrabVideoFrame = async (url: string) => {
    setFrameGrabber({ url, time: 0, duration: 0 });
  };

  const captureFrameAtTime = async () => {
    if (!frameGrabber || !frameVideoRef.current) return;
    const video = frameVideoRef.current;
    try {
      if (Math.abs(video.currentTime - frameGrabber.time) > 0.02) {
        video.currentTime = frameGrabber.time;
        await new Promise<void>((resolve, reject) => {
          const done = () => {
            video.removeEventListener('seeked', done);
            video.removeEventListener('error', fail);
            resolve();
          };
          const fail = () => {
            video.removeEventListener('seeked', done);
            video.removeEventListener('error', fail);
            reject(new Error('Unable to seek this video frame.'));
          };
          video.addEventListener('seeked', done, { once: true });
          video.addEventListener('error', fail, { once: true });
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.width || !canvas.height) {
        throw new Error('Unable to read a video frame.');
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameUrl = canvas.toDataURL('image/png');
      useAsSource({ type: 'image', url: frameUrl, label: 'Video frame' });
      setFrameGrabber(null);
    } catch (error: any) {
      alert(error.message || 'Unable to grab a frame from this video.');
    }
  };

  const handleDeleteLog = async (id: string) => {
    setLogs((prev) => prev.filter((log) => log.id !== id));
    fetch(`/api/history/${id}`, { method: 'DELETE' }).catch((error) => {
      console.warn('Failed to delete history item on server.', error);
    });
  };

  const pollTaskResult = async (logId: string, taskId: string, modelId: string, type: 'image' | 'video' | 'text') => {
    if (activePollsRef.current.has(logId)) return;
    activePollsRef.current.add(logId);

    try {
      const headers = getKieHeaders();
      const isVeo = modelId === 'veo-3.1';
      let mediaUrl = '';
      let mediaUrls: string[] = [];

      for (let attempt = 0; attempt < 300; attempt += 1) {
        await new Promise(r => setTimeout(r, 3000));

        const pollRes = await fetch(isVeo ? `/api/kie/api/v1/veo/record-info?taskId=${taskId}` : `/api/kie/api/v1/jobs/recordInfo?taskId=${taskId}`, {
          method: 'GET',
          headers,
        });

        const pollData = await pollRes.json();

        if (!isKieSuccessResponse(pollRes, pollData)) {
          throw new Error(pollData.msg || pollData.error || 'Failed to query task status');
        }

        const state = isVeo ? pollData.data?.successFlag : pollData.data?.state;
        if (state === 'success' || state === 1 || state === 'completed' || state === 'succeeded') {
          const resultData = isVeo
            ? (pollData.data?.resultUrls || pollData.data?.response?.resultUrls)
            : (pollData.data?.resultJson || pollData.data?.resultUrls || pollData.data?.response);
          mediaUrls = normalizeResultUrls(resultData);
          mediaUrl = mediaUrls[0] || '';
          break;
        }

        if (state === 'fail' || state === 'failed' || state === 2 || state === 3 || state === 'error') {
          throw new Error(pollData.data?.failMsg || 'Generation task failed');
        }
      }

      if (!mediaUrl) {
        throw new Error('No media URL returned after generation success');
      }

      const localMediaUrls = await Promise.all(mediaUrls.map((url) => saveGeneratedMedia(url, type === 'video' ? 'video' : 'image')));

      setLogs((prev) =>
        prev.map((l) => (l.id === logId ? {
          ...l,
          status: 'success',
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - new Date(l.timestamp).getTime(),
          mediaUrl: localMediaUrls[0],
          mediaUrls: localMediaUrls,
        } : l))
      );
    } catch (error: any) {
      setLogs((prev) =>
        prev.map((l) =>
          l.id === logId
            ? { ...l, status: 'failed', completedAt: new Date().toISOString(), durationMs: Date.now() - new Date(l.timestamp).getTime(), error: error.message || 'Unknown error' }
            : l
        )
      );
    } finally {
      activePollsRef.current.delete(logId);
    }
  };

  useEffect(() => {
    if (!historyLoaded) return;
    logs.forEach((log) => {
      if (log.status === 'generating' && log.taskId) {
        pollTaskResult(log.id, log.taskId, log.modelId, log.type);
      }
    });
  }, [historyLoaded, logs]);

  const handleGenerate = async (prompt: string, imageBase64?: string, videoBase64?: string, params?: Record<string, any>) => {
    const submissionSignature = buildGenerationSignature(selectedModel, prompt, imageBase64, videoBase64, params);
    const now = Date.now();
    if (createTaskInFlightRef.current) {
      console.warn('Ignored duplicate generate request while a task create request is already in flight.');
      return;
    }
    if (
      lastSubmissionRef.current?.signature === submissionSignature &&
      now - lastSubmissionRef.current.timestamp < 30_000
    ) {
      console.warn('Ignored duplicate generate request with the same payload.');
      return;
    }

    createTaskInFlightRef.current = true;
    setIsCreateTaskPending(true);
    lastSubmissionRef.current = { signature: submissionSignature, timestamp: now };

    const logEntry: GenerationLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      modelId: selectedModel.id,
      modelName: selectedModel.name,
      provider: selectedModel.provider,
      prompt,
      status: 'generating',
      type: selectedModel.category.includes('video') ? 'video' : 'image',
    };

    setLogs((prev) => [logEntry, ...prev]);

    try {
      const headers = getKieHeaders();

      // Helper to upload base64 to our server which proxies to tmpfiles for a public URL
      const getPublicUrl = async (dataUrl: string) => {
        if (!dataUrl) return dataUrl;
        let uploadDataUrl = dataUrl;

        if (!uploadDataUrl.startsWith('data:') && (uploadDataUrl.startsWith('/library/') || uploadDataUrl.startsWith('blob:'))) {
          try {
            const response = await fetch(uploadDataUrl);
            if (!response.ok) {
              throw new Error(`Unable to read source media: ${response.statusText}`);
            }
            const blob = await response.blob();
            uploadDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
          } catch (error) {
            console.error('Failed to read local source media', error);
            return dataUrl;
          }
        }

        if (!uploadDataUrl.startsWith('data:')) return uploadDataUrl;

        try {
          const res = await fetch('/api/upload-temp', {
             method: 'POST',
             headers,
             body: JSON.stringify({ dataUrl: uploadDataUrl })
          });
          if (res.ok) {
            const data = await res.json();
            return data.url || uploadDataUrl;
          }
        } catch(e) {
          console.error('Failed to get public url', e);
        }
        return uploadDataUrl;
      };

      // Ensure we have public URLs for services that reject base64 (e.g., KIE missing base64 support for grok-imagine)
      const finalVideoStr = videoBase64 ? await getPublicUrl(videoBase64) : '';
      const finalImageStr = imageBase64 ? await getPublicUrl(imageBase64) : '';

      const normalizedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(params || {})) {
        if (value === '' || value === null || value === undefined) continue;
        const normalizedValue = typeof value === 'string' && value.startsWith('data:')
          ? await getPublicUrl(value)
          : value;
        normalizedParams[key] = arrayUrlParams.has(key) && !Array.isArray(normalizedValue)
          ? [normalizedValue]
          : normalizedValue;
      }

      // Step 1: Create Task
      const inputPayload: any = {
        prompt: prompt.trim(),
      };

      Object.assign(inputPayload, normalizedParams);

      if (finalVideoStr) {
        if (assignModelVideoInput(inputPayload, selectedModel, finalVideoStr)) {
          // Model-specific video source key is defined in the catalog.
        } else if (selectedModel.id === 'bytedance/seedance-2') {
          inputPayload.reference_video_urls = [finalVideoStr];
        } else if (selectedModel.id === 'gemini-omni-video') {
          inputPayload.video_list = [{
            url: finalVideoStr,
            start: Number(inputPayload.video_start || 0),
            ends: Number(inputPayload.video_end || 10),
          }];
        } else if (selectedModel.id === 'wan/2-6-video-to-video') {
          inputPayload.video_urls = [finalVideoStr];
        } else if (selectedModel.id.includes('wan') && selectedModel.category === 'image-to-video') {
          inputPayload.first_clip_url = finalVideoStr;
        } else if (selectedModel.id === 'kling-3.0/video') {
          inputPayload.video_urls = [finalVideoStr];
        } else if (selectedModel.id === 'veo-3.1') {
          inputPayload.imageUrls = [finalVideoStr];
        } else {
          inputPayload.video_url = finalVideoStr;
        }
      }
      if (finalImageStr && selectedModel.supportsImageUpload) {
        if (assignModelImageInput(inputPayload, selectedModel, finalImageStr)) {
          // Model-specific image source key is defined in the catalog.
        } else if (selectedModel.id.includes('grok-imagine')) {
          inputPayload.image_urls = [finalImageStr];
        } else if (selectedModel.id.includes('nano-banana')) {
          inputPayload.image_input = [finalImageStr];
        } else if (selectedModel.id === 'wan/2-7-image') {
          inputPayload.input_urls = [finalImageStr];
        } else if (selectedModel.id === 'happyhorse/image-to-video') {
          inputPayload.image_urls = [finalImageStr];
        } else if (selectedModel.id === 'gemini-omni-video') {
          inputPayload.image_urls = [finalImageStr];
        } else if (selectedModel.id === 'veo-3.1') {
          inputPayload.imageUrls = [finalImageStr];
        } else if (selectedModel.id === 'wan/2-5-image-to-video') {
          inputPayload.image_url = finalImageStr;
        } else if (selectedModel.id === 'wan/2-6-image-to-video') {
          inputPayload.image_urls = [finalImageStr];
        } else if (selectedModel.id.includes('wan') && selectedModel.category === 'image-to-video') {
          inputPayload.first_frame_url = finalImageStr;
        } else if (selectedModel.id === 'bytedance/seedance-2') {
          inputPayload.first_frame_url = finalImageStr;
        } else if (selectedModel.id === 'bytedance/seedance-1.5-pro') {
          inputPayload.input_urls = [finalImageStr];
        } else if (selectedModel.id.includes('bytedance') && selectedModel.category === 'image-to-video') {
          inputPayload.image_url = finalImageStr;
        } else if (selectedModel.id === 'kling-3.0/video') {
          inputPayload.image_urls = [finalImageStr];
        } else {
          inputPayload.image_url = finalImageStr;
        }
      }

      if ((selectedModel.category === 'image-to-image' || selectedModel.category === 'image-edit') && !finalImageStr) {
        throw new Error(`${selectedModel.name} requires a source image.`);
      }

      if (selectedModel.requiresImageInput && !finalImageStr) {
        throw new Error(`${selectedModel.name} requires a source image.`);
      }

      if (selectedModel.category === 'video-to-video' && !finalVideoStr) {
        throw new Error(`${selectedModel.name} requires a source video.`);
      }

      if (selectedModel.requiresVideoInput && !finalVideoStr) {
        throw new Error(`${selectedModel.name} requires a source video.`);
      }

      if (selectedModel.id === 'wan/2-7-text-to-video') {
        inputPayload.ratio = inputPayload.aspect_ratio;
        delete inputPayload.aspect_ratio;
        delete inputPayload.enable_prompt_expansion;
        delete inputPayload.nsfw_checker;
      }

      if (selectedModel.id === 'wan/2-6-text-to-video') {
        delete inputPayload.aspect_ratio;
        delete inputPayload.negative_prompt;
        delete inputPayload.enable_prompt_expansion;
        delete inputPayload.prompt_extend;
        delete inputPayload.watermark;
        delete inputPayload.seed;
      }

      if (selectedModel.id === 'wan/2-5-text-to-video') {
        delete inputPayload.prompt_extend;
        delete inputPayload.watermark;
      }

      if (selectedModel.id === 'wan/2-6-image-to-video') {
        delete inputPayload.negative_prompt;
        delete inputPayload.last_frame_url;
        delete inputPayload.audio_url;
        delete inputPayload.enable_prompt_expansion;
        delete inputPayload.prompt_extend;
        delete inputPayload.watermark;
        delete inputPayload.seed;
      }

      if (selectedModel.id === 'wan/2-6-video-to-video') {
        if (!inputPayload.video_urls?.length) {
          throw new Error('Wan 2.6 video-to-video requires an uploaded video.');
        }
      }

      if (selectedModel.id === 'wan/2-5-image-to-video') {
        delete inputPayload.last_frame_url;
        delete inputPayload.audio_url;
        delete inputPayload.prompt_extend;
        delete inputPayload.watermark;
      }

      if (selectedModel.id === 'wan/2-7-image-to-video') {
        delete inputPayload.enable_prompt_expansion;
        delete inputPayload.nsfw_checker;
      }

      if (selectedModel.id === 'grok-imagine/text-to-image') {
        delete inputPayload.image_urls;
      }

      if (selectedModel.id === 'kling-3.0/video') {
        inputPayload.multi_shots = false;
        inputPayload.mode = inputPayload.mode || 'pro';
        inputPayload.sound = inputPayload.sound ?? true;
        delete inputPayload.negative_prompt;
        delete inputPayload.seed;
      }

      if (selectedModel.id === 'hailuo/02-text-to-video-pro') {
        inputPayload.prompt_optimizer = inputPayload.prompt_optimizer ?? true;
        delete inputPayload.aspect_ratio;
        delete inputPayload.negative_prompt;
        delete inputPayload.seed;
      }

      if (selectedModel.id === 'google/imagen4-fast') {
        delete inputPayload.seed;
      }

      if (selectedModel.id === 'qwen/image-edit') {
        inputPayload.sync_mode = false;
      }

      if (selectedModel.id === 'gemini-omni-video') {
        if (typeof inputPayload.audio_ids === 'string') {
          inputPayload.audio_ids = inputPayload.audio_ids.split(',').map((item: string) => item.trim()).filter(Boolean);
        }
        if (typeof inputPayload.character_ids === 'string') {
          inputPayload.character_ids = inputPayload.character_ids.split(',').map((item: string) => item.trim()).filter(Boolean);
        }
        delete inputPayload.video_start;
        delete inputPayload.video_end;
      }

      if (selectedModel.id === 'veo-3.1') {
        if (selectedModel.category === 'text-to-video') {
          delete inputPayload.imageUrls;
        } else if (!inputPayload.imageUrls?.length) {
          throw new Error('Veo 3.1 image-to-video requires an uploaded image.');
        }
      }
      
      const isVeo = selectedModel.id === 'veo-3.1';
      const requestBody = isVeo
        ? compactInput(inputPayload)
        : {
          model: selectedModel.id,
          input: compactInput(inputPayload)
        };

      const createRes = await fetch(isVeo ? `/api/kie/api/v1/veo/generate` : `/api/kie/api/v1/jobs/createTask`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const createData = await createRes.json();
      
      if (!isKieSuccessResponse(createRes, createData) || !createData.data?.taskId) {
        throw new Error(createData.msg || createData.error || 'Failed to create generation task');
      }

      const taskId = createData.data.taskId;
      setLogs((prev) =>
        prev.map((l) => (l.id === logEntry.id ? { ...l, taskId } : l))
      );
      pollTaskResult(logEntry.id, taskId, selectedModel.id, logEntry.type);
    } catch (error: any) {
      setLogs((prev) =>
        prev.map((l) =>
          l.id === logEntry.id
            ? { ...l, status: 'failed', completedAt: new Date().toISOString(), durationMs: Date.now() - new Date(l.timestamp).getTime(), error: error.message || 'Unknown error' }
            : l
        )
      );
    }
    finally {
      createTaskInFlightRef.current = false;
      setIsCreateTaskPending(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      {/* Sidebar - Models */}
      <div className="w-72 bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-semibold text-lg tracking-tight">Media Studio</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-0 flex flex-col">
          <ModelSidebar 
            selectedModel={selectedModel} 
            onSelectModel={setSelectedModel} 
            onOpenSettings={() => setShowSettings(true)}
            credits={credits}
            creditError={creditError}
            isLoadingCredits={isLoadingCredits}
            onRefreshCredits={fetchCredits}
          />
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-neutral-950 relative">
        <MediaWorkspace 
          selectedModel={selectedModel} 
          onGenerate={handleGenerate} 
          isGenerating={isCreateTaskPending || (logs.length > 0 && logs[0].status === 'generating')}
          latestLog={logs[0]}
          sourceAsset={sourceAsset}
        />
      </div>

      {/* Right Sidebar - Activity Log */}
      <div className="w-80 bg-neutral-900 border-l border-neutral-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-neutral-800">
          <h2 className="font-medium text-sm text-neutral-400 uppercase tracking-wider">Activity Log</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ActivityLog
            logs={logs}
            onUseAsSource={useAsSource}
            onGrabVideoFrame={handleGrabVideoFrame}
            onDeleteLog={handleDeleteLog}
          />
        </div>
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSaveSettings={fetchCredits}
      />

      {frameGrabber && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-3xl rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">Grab Video Frame</h3>
                <p className="text-xs text-neutral-500 mt-1">Choose the frame time, then set it as the image source.</p>
              </div>
              <button
                onClick={() => setFrameGrabber(null)}
                className="p-2 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <video
                ref={frameVideoRef}
                src={frameGrabber.url}
                className="w-full max-h-[55vh] rounded-lg bg-black object-contain"
                controls
                preload="metadata"
                onLoadedMetadata={(event) => {
                  const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
                  setFrameGrabber((current) => current ? { ...current, duration, time: Math.min(current.time, duration) } : current);
                }}
                onTimeUpdate={(event) => {
                  const currentTime = event.currentTarget.currentTime;
                  setFrameGrabber((current) => current ? { ...current, time: currentTime } : current);
                }}
              />
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={Math.max(frameGrabber.duration, 0)}
                  step={0.05}
                  value={frameGrabber.time}
                  onChange={(event) => {
                    const nextTime = Number(event.target.value);
                    if (frameVideoRef.current) {
                      frameVideoRef.current.currentTime = nextTime;
                    }
                    setFrameGrabber((current) => current ? { ...current, time: nextTime } : current);
                  }}
                  className="flex-1 accent-indigo-500"
                />
                <div className="w-24 text-right text-xs font-mono text-neutral-400">
                  {frameGrabber.time.toFixed(2)}s
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setFrameGrabber(null)}
                  className="px-4 py-2 rounded-lg border border-neutral-800 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                >
                  Cancel
                </button>
                <button
                  onClick={captureFrameAtTime}
                  className="px-4 py-2 rounded-lg bg-indigo-500 text-sm font-medium text-white hover:bg-indigo-400"
                >
                  Use Frame
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
