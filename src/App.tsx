/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { MediaWorkspace } from './components/MediaWorkspace';
import {MediaSourcePicker, ImageDestinationDialog, type VideoFrameSource} from './components/MediaSourcePicker';
import {imageDestination, imageInputRole, type ImageInputRole} from './models/imageInputs';
import { AudioWorkspace } from './components/AudioWorkspace';
import { ActivityLog } from './components/ActivityLog';
import { SettingsModal } from './components/SettingsModal';
import { GenerationLog, AIModel, Project } from './types';
import { MODEL_REGISTRY as SUPPORTED_MODELS, resolveModel } from './models/registry';
import { isStaleGeneration, jsonRequest, pollGeneration } from './generation/client';
import {LibraryGallery} from './components/LibraryGallery';
import {ProductionLibrary} from './components/ProductionLibrary';
import {ProductionStudio} from './components/ProductionStudio';
import type {ProductionAsset} from './models/assets';
import {localMediaUrls} from './models/assets';
import {WORKFLOWS,primaryWorkflow,supportsWorkflow,firstImageParameter,type Workflow} from './models/workflows';
import { ModelBrowser } from './ui/drawers/ModelBrowser';
import {modelKey,rememberSelection,savedSelection,sectionForModel,type StudioSection} from './models/preferences';
import type { AppTheme } from './types';
import { createHistoryApi } from './lib/historyApi';
import { pollKieTask } from './lib/kieTaskPolling';
import { Download, Edit3, FolderOpen, PanelRightClose, Plus, Trash2, Wallet, X } from 'lucide-react';

const arrayUrlParams = new Set(['image_urls', 'input_urls', 'image_input', 'mask_url', 'image_references', 'reference_image_urls', 'reference_video_urls', 'reference_audio_urls', 'video_urls', 'keyframe_urls']);
type SourceAsset = { id: string; type: 'image' | 'video' | 'audio'; url: string; label?: string; parameterKey?: string; imageRole?: ImageInputRole };
type PaneSide = 'left' | 'right';

const logKey = (projectId: string, id: string) => `${projectId}:${id}`;

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
      return parsed.startsWith('http') || parsed.startsWith('/library/') || parsed.startsWith('/projects/') ? [parsed] : [];
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

const normalizeTextResult = (result: any): string => {
  if (result === null || result === undefined || result === '') return '';

  if (typeof result === 'string') {
    try {
      return normalizeTextResult(JSON.parse(result));
    } catch {
      return result;
    }
  }

  if (Array.isArray(result)) {
    return result.map((item) => normalizeTextResult(item)).filter(Boolean).join('\n');
  }

  if (typeof result === 'object') {
    const directValue = result.character_id || result.characterId || result.audio_id || result.audioId || result.id || result.text || result.output;
    if (directValue !== undefined && directValue !== null && typeof directValue !== 'object') {
      return String(directValue);
    }
    return JSON.stringify(result, null, 2);
  }

  return String(result);
};

const isVeoModel = (modelId: string) => modelId === 'veo-3.1' || modelId.startsWith('veo/');

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

const getSavedModel = () => {
  const saved = localStorage.getItem('kie_selected_model');
  return SUPPORTED_MODELS.find((model) => `${model.category}:${model.id}` === saved) || SUPPORTED_MODELS[0];
};

export default function App() {
  const [workflow,setWorkflow]=useState<Workflow>(()=>primaryWorkflow(getSavedModel()));
  const [page, setPage] = useState('Home');
  const [remix,setRemix] = useState<{id:string;prompt:string;settings:Record<string,any>} | null>(null);
  const [inspected, setInspected] = useState<GenerationLog | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModel>(getSavedModel);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [autoplayVideos, setAutoplayVideos] = useState(() => localStorage.getItem('kie_autoplay_videos') === 'true');
  const [theme, setTheme] = useState<AppTheme>(() => localStorage.getItem('kie_theme') === 'light' ? 'light' : 'dark');
  const [projectDialog, setProjectDialog] = useState<{ mode: 'create' | 'rename'; name: string; projectId?: string } | null>(null);
  const [credits, setCredits] = useState<number | string | null>(null);
  const [creditError, setCreditError] = useState('');
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyBackfilled, setHistoryBackfilled] = useState(false);
  const [historySaveError, setHistorySaveError] = useState('');
  const [historyRetryToken, setHistoryRetryToken] = useState(0);
  const [sourceAsset, setSourceAsset] = useState<SourceAsset | null>(null);
  const [frameGrabber, setFrameGrabber] = useState<VideoFrameSource | null>(null);
  const [transferImage, setTransferImage] = useState<string | null>(null);
  const [isCreateTaskPending, setIsCreateTaskPending] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [leftPaneOpen, setLeftPaneOpen] = useState(false);
  const [rightPaneOpen, setRightPaneOpen] = useState(false);
  const [historyApi] = useState(createHistoryApi);
  const persistedLogSignaturesRef = useRef(new Map<string, string>());
  const currentProjectIdRef = useRef<string | null>(null);
  const activePollsRef = useRef(new Set<string>());
  const cancelledLogKeysRef = useRef(new Set<string>());
  const createTaskInFlightRef = useRef(false);
  const lastSubmissionRef = useRef<{ signature: string; timestamp: number } | null>(null);
  const inspectorVideoRef = useRef<HTMLVideoElement>(null);
  const currentProject = projects.find((project) => project.id === currentProjectId) || null;
  const activeLog = logs.find((log) => log.id === activeLogId);
  const hasGeneratingLogs = logs.some((log) => log.status === 'generating');
  const projectApiUrl = (path: string) => new URL(path, window.location.origin).toString();
  const findSavedSelection = (projectId:string,section:StudioSection) => {
    const saved=savedSelection(localStorage,projectId,section);
    if(!saved)return null;
    const model=SUPPORTED_MODELS.find(item=>modelKey(item)===saved.modelKey&&!item.unavailableReason);
    return model&&sectionForModel(model)===section&&supportsWorkflow(model,saved.workflow)?{model,workflow:saved.workflow}:null;
  };
  const selectModel = (model:AIModel,nextWorkflow=primaryWorkflow(model)) => {
    setSelectedModel(model);setWorkflow(nextWorkflow);
    if(currentProjectId)rememberSelection(localStorage,currentProjectId,sectionForModel(model),{modelKey:modelKey(model),workflow:nextWorkflow});
  };
  const openCreationSection = (section:StudioSection) => {
    const saved=currentProjectId?findSavedSelection(currentProjectId,section):null;
    const fallback=SUPPORTED_MODELS.find(model=>sectionForModel(model)===section&&!model.unavailableReason);
    const choice=saved||fallback&&{model:fallback,workflow:primaryWorkflow(fallback)};
    setPage(section[0].toUpperCase()+section.slice(1));setActiveLogId(null);setSourceAsset(null);
    if(choice)selectModel(choice.model,choice.workflow);
  };

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
    setSourceAsset(null); setFrameGrabber(null); setTransferImage(null);
  }, [currentProjectId]);

  useEffect(()=>{
    if(!currentProjectId||!['Image','Video','Audio'].includes(page))return;
    const saved=findSavedSelection(currentProjectId,page.toLowerCase() as StudioSection);
    if(saved){setSelectedModel(saved.model);setWorkflow(saved.workflow);}
  },[currentProjectId]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const updateLayout = () => setIsCompactLayout(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    if (isCompactLayout && leftPaneOpen && rightPaneOpen) setRightPaneOpen(false);
  }, [isCompactLayout, leftPaneOpen, rightPaneOpen]);

  useEffect(() => {
    if (!leftPaneOpen && !rightPaneOpen) return;
    const closePaneOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (leftPaneOpen) setLeftPaneOpen(false);
      else setRightPaneOpen(false);
    };
    window.addEventListener('keydown', closePaneOnEscape);
    return () => window.removeEventListener('keydown', closePaneOnEscape);
  }, [isCompactLayout, leftPaneOpen, rightPaneOpen]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('kie_theme', theme);
  }, [theme]);

  const openPane = (side: PaneSide) => {
    if (side === 'left') {
      setRightPaneOpen(false);
      setLeftPaneOpen(true);
    } else {
      setLeftPaneOpen(false);
      setRightPaneOpen(true);
    }
  };

  const closePane = (side: PaneSide) => {
    if (side === 'left') setLeftPaneOpen(false);
    else setRightPaneOpen(false);
  };

  useEffect(() => {
    localStorage.setItem('kie_selected_model', `${selectedModel.category}:${selectedModel.id}`);
  }, [selectedModel]);

  useEffect(() => {
    const key = localStorage.getItem('kie_client_api_key');
    if (key) fetch('/api/providers', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys:{kie:key}})})
      .then(response => {if (response.ok) localStorage.removeItem('kie_client_api_key');});
  }, []);
  const getKieHeaders = () => ({'Content-Type':'application/json'});

  const fetchCredits = async () => {
    setIsLoadingCredits(true);
    setCreditError('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

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

  const refreshProjects = async () => {
    const res = await fetch(projectApiUrl('/api/projects'));
    const data = await res.json();
    const nextProjects = Array.isArray(data.projects) ? data.projects : [];
    setProjects(nextProjects);
    return { projects: nextProjects, defaultProjectId: data.defaultProjectId || 'default' };
  };

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const { projects: loadedProjects, defaultProjectId } = await refreshProjects();
        const savedProjectId = localStorage.getItem('kie_current_project_id');
        const initialProjectId = loadedProjects.some((project) => project.id === savedProjectId)
          ? savedProjectId
          : loadedProjects[0]?.id || defaultProjectId;
        setCurrentProjectId(initialProjectId);
      } catch (error) {
        console.warn('Failed to load projects.', error);
        setCurrentProjectId(null);
        setHistoryLoaded(true);
      }
    };

    loadProjects();
    fetchCredits();
  }, []);

  useEffect(() => {
    if (!hasGeneratingLogs) return;

    fetchCredits();
    const timer = window.setInterval(fetchCredits, 15_000);
    return () => window.clearInterval(timer);
  }, [hasGeneratingLogs]);

  useEffect(() => {
    let cancelled = false;
    if (!currentProjectId) {
      setLogs([]);
      setActiveLogId(null);
      persistedLogSignaturesRef.current.clear();
      setLoadedProjectId(null);
      setHistoryLoaded(true);
      setHistorySaveError('');
      return;
    }

    const projectId = currentProjectId;
    const loadProjectHistory = async () => {
      setHistoryLoaded(false);
      setHistoryBackfilled(false);
      persistedLogSignaturesRef.current.clear();
      setHistorySaveError('');
      try {
        const res = await fetch(projectApiUrl(`/api/projects/${encodeURIComponent(projectId)}/history`));
        const data = await res.json();
        if (cancelled) return;
        const serverLogs: GenerationLog[] = Array.isArray(data.logs) ? [...data.logs] : [];
        const queued = await jsonRequest('/api/generation/jobs');
        if (cancelled) return;
        for (const job of queued.jobs.filter((j:any)=>j.projectId===projectId && !j.hidden)) {
          const index=serverLogs.findIndex(l=>l.generationJobId===job.id || l.id===job.historyId);
          if (index>=0 && serverLogs[index].generationJobId) continue;
          const model=SUPPORTED_MODELS.find(m=>m.logicalId===job.logicalModel);
          const recovered: GenerationLog={id:job.historyId || job.id,generationJobId:job.id,taskId:job.id,providerTaskId:job.taskId,logicalModel:job.logicalModel,normalizedStatus:job.status,modelId:model?.id || job.logicalModel,modelName:model?.name || job.logicalModel,provider:job.provider,prompt:job.prompt,settingsSnapshot:job.settings,sourceMediaUrls:job.sourceMediaUrls,productionShotId:job.productionShotId,estimatedCost:job.estimatedCost,finalCost:job.finalCost,timestamp:job.createdAt,type:model?.category.includes('video')?'video':model?.category==='text-to-audio'?'audio':model?.category==='text-to-text'?'text':'image',status:['failed','canceled','unknown'].includes(job.status)?'failed':'generating',error:job.error};
          if(index>=0)serverLogs[index]=recovered;else serverLogs.unshift(recovered);
        }
        persistedLogSignaturesRef.current = new Map((Array.isArray(data.logs)?data.logs:[]).map((log: GenerationLog) => [log.id, JSON.stringify(log)]));
        setLogs(serverLogs);
        setActiveLogId(null);
        setLoadedProjectId(projectId);
        localStorage.setItem('kie_current_project_id', projectId);
      } catch (error) {
        if (cancelled) return;
        console.warn('Failed to load project history.', error);
        setHistorySaveError('Unable to load project history.');
        setLogs([]);
        setActiveLogId(null);
        setLoadedProjectId(projectId);
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    };

    loadProjectHistory();
    return () => { cancelled = true; };
  }, [currentProjectId]);

  useEffect(() => {
    if (!historyLoaded || !currentProjectId || loadedProjectId !== currentProjectId) return;
    const persisted = persistedLogSignaturesRef.current;
    const currentSignatures = new Map(logs.map((log) => [log.id, JSON.stringify(log)]));
    const changedLogs = logs.filter((log) => persisted.get(log.id) !== currentSignatures.get(log.id));
    const deletedIds = [...persisted.keys()].filter((id) => !currentSignatures.has(id));
    if (changedLogs.length === 0 && deletedIds.length === 0) return;

    changedLogs.forEach((log) => {
      const signature = currentSignatures.get(log.id)!;
      historyApi.saveLog(currentProjectId, log)
        .then(() => {
          if (currentProjectIdRef.current === currentProjectId) {
            persistedLogSignaturesRef.current.set(log.id, signature);
          }
          if (currentProjectIdRef.current === currentProjectId) setHistorySaveError('');
        })
        .catch((error) => {
          if (currentProjectIdRef.current === currentProjectId) {
            setHistorySaveError(error.message || 'Unable to save project history.');
          }
        });
    });

    deletedIds.forEach((id) => {
      historyApi.deleteLog(currentProjectId, id)
        .then(() => {
          if (currentProjectIdRef.current === currentProjectId) {
            persistedLogSignaturesRef.current.delete(id);
            setHistorySaveError('');
          }
        })
        .catch((error) => {
          if (currentProjectIdRef.current === currentProjectId) {
            setHistorySaveError(error.message || 'Unable to remove history item.');
          }
        });
    });
  }, [logs, historyLoaded, currentProjectId, loadedProjectId, historyRetryToken]);

  useEffect(() => {
    if (!historyLoaded || loadedProjectId !== currentProjectId) return;

    setLogs((prev) => prev.map((log) => {
      if (log.status !== 'generating') return log;
      if (log.taskId && !isStaleGeneration(log.timestamp)) return log;
      if (!log.taskId && !isStaleGeneration(log.timestamp, Date.now(), 60_000)) return log;
      return {
        ...log,
        status: 'failed',
        normalizedStatus: 'stalled',
        pollingState: log.taskId ? 'timed-out' : undefined,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(log.timestamp).getTime(),
        error: log.taskId
          ? 'No completion was reported for over 2 hours. Check the provider once more or stop tracking this task.'
          : 'Generation was interrupted before the task ID was saved. Please generate it again.',
      };
    }));
  }, [historyLoaded, loadedProjectId, currentProjectId]);

  const saveGeneratedMedia = async (url: string, type: 'image' | 'video' | 'audio', projectId = currentProjectId) => {
    try {
      const endpoint = projectId
        ? projectApiUrl(`/api/projects/${encodeURIComponent(projectId)}/library/save-url`)
        : projectApiUrl('/api/library/save-url');
      const res = await fetch(endpoint, {
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
    if (!historyLoaded || loadedProjectId !== currentProjectId || historyBackfilled || logs.length === 0) return;

    const projectId = currentProjectId;
    let cancelled = false;
    const backfillRemoteMedia = async () => {
      let changed = false;
      const updatedLogs = await Promise.all(logs.map(async (log) => {
        if (log.status !== 'success') return log;
        const urls = (log.mediaUrls && log.mediaUrls.length > 0 ? log.mediaUrls : [log.mediaUrl]).filter(Boolean) as string[];
        if (urls.length === 0 || urls.every((url) => url.startsWith('/library/') || url.startsWith('/projects/') || url.startsWith('data:'))) return log;

        const localUrls = await Promise.all(urls.map((url) => saveGeneratedMedia(url, log.type, projectId)));
        if (localUrls.some((url, index) => url !== urls[index])) {
          changed = true;
          return { ...log, mediaUrl: localUrls[0], mediaUrls: localUrls };
        }
        return log;
      }));

      if (cancelled || currentProjectIdRef.current !== projectId) return;
      if (changed) {
        setLogs(updatedLogs);
      }
      setHistoryBackfilled(true);
    };

    backfillRemoteMedia();
    return () => { cancelled = true; };
  }, [historyLoaded, loadedProjectId, currentProjectId, historyBackfilled, logs]);

  const useAsSource = (asset: { type: 'image' | 'video'; url: string; label?: string }) => {
    if (asset.type === 'image') {setTransferImage(asset.url); setRightPaneOpen(false); return;}
    setPage(asset.type==='video'?'Video':selectedModel.category.includes('video')?'Video':'Image');
    setSourceAsset({ ...asset, id: crypto.randomUUID() });
    setRightPaneOpen(false);
  };

  const handleGrabVideoFrame = (url: string, time = 0) => {
    setFrameGrabber({url, time}); setInspected(null); setRightPaneOpen(false);
  };

  const handleRevealFile = async (url: string) => {
    try {
      const res = await fetch(projectApiUrl('/api/reveal-file'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, projectId: currentProjectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Unable to reveal file in Finder.');
    } catch (error: any) {
      alert(error.message || 'Unable to reveal file in Finder.');
    }
  };

  const handleDeleteLogs = async (ids: string[]) => {
    const projectId = currentProjectId;
    const selectedIds = new Set(ids);
    const selectedLogs = logs.filter((item) => selectedIds.has(item.id));
    if (!projectId || !selectedLogs.length) return false;
    const message = selectedLogs.length === 1
      ? 'Delete this item and its saved local media? This cannot be undone.'
      : `Delete ${selectedLogs.length} selected items and their saved local media? This cannot be undone.`;
    if (!window.confirm(message)) return false;
    selectedLogs.forEach((log) => cancelledLogKeysRef.current.add(logKey(projectId, log.id)));

    try {
      await historyApi.deleteMany(projectId, [...selectedIds]);
      if (currentProjectIdRef.current !== projectId) return true;
      selectedIds.forEach((id) => persistedLogSignaturesRef.current.delete(id));
      setLogs((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      setActiveLogId((current) => current && selectedIds.has(current) ? null : current);
      setInspected((current) => current && selectedIds.has(current.id) ? null : current);
      return true;
    } catch (error: any) {
      selectedLogs.forEach((log) => cancelledLogKeysRef.current.delete(logKey(projectId, log.id)));
      setHistorySaveError(error.message || 'Unable to remove history item.');
      return false;
    }
  };

  const handleDeleteLog = async (id: string) => {
    await handleDeleteLogs([id]);
  };

  const handleExportLogs = (ids: string[]) => {
    if (!currentProjectId || !ids.length) return;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = projectApiUrl(`/api/projects/${encodeURIComponent(currentProjectId)}/export-selection`);
    form.hidden = true;
    const field = document.createElement('input');
    field.name = 'logIds';
    field.value = JSON.stringify(ids);
    form.appendChild(field);
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const handleStopTracking = async (id: string) => {
    const projectId = currentProjectId;
    const log = logs.find((item) => item.id === id);
    if (!projectId || !log) return;
    const key = logKey(projectId, id);
    cancelledLogKeysRef.current.add(key);
    try {
      if (log.generationJobId) await jsonRequest(`/api/generation/jobs/${log.generationJobId}/stop`, {});
      setLogs((current) => current.map((item) => item.id === id ? {
        ...item,
        status: 'failed',
        normalizedStatus: 'canceled',
        pollingState: undefined,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(item.timestamp).getTime(),
        error: 'Stopped tracking locally. The provider may still finish a task that could not be canceled remotely.',
      } : item));
    } catch (error: any) {
      cancelledLogKeysRef.current.delete(key);
      setHistorySaveError(error.message || 'Unable to stop tracking this task.');
    }
  };

  const updateLogForProject = (
    projectId: string,
    logId: string,
    detachedLog: GenerationLog,
    update: (log: GenerationLog) => GenerationLog,
  ) => {
    if (cancelledLogKeysRef.current.has(logKey(projectId, logId))) return;
    if (currentProjectIdRef.current === projectId) {
      setLogs((prev) => prev.map((log) => (log.id === logId ? update(log) : log)));
      return;
    }

    void historyApi.saveLog(projectId, update(detachedLog)).catch((error) => {
      console.warn('Failed to persist background task update.', error);
    });
  };

  const updateCurrentLog = (projectId: string, logId: string, update: (log: GenerationLog) => GenerationLog) => {
    if (cancelledLogKeysRef.current.has(logKey(projectId, logId))) return;
    if (currentProjectIdRef.current !== projectId) return;
    setLogs((prev) => prev.map((log) => (log.id === logId ? update(log) : log)));
  };

  const pollTaskResult = async (
    logId: string,
    taskId: string,
    modelId: string,
    type: 'image' | 'video' | 'audio' | 'text',
    projectId: string,
    initialLog: GenerationLog,
  ) => {
    const pollKey = logKey(projectId, logId);
    if (activePollsRef.current.has(pollKey)) return;
    activePollsRef.current.add(pollKey);

    try {
      const headers = getKieHeaders();
      const isVeo = isVeoModel(modelId);
      let mediaUrl = '';
      let mediaUrls: string[] = [];
      let textResult = '';

      updateCurrentLog(projectId, logId, (log) => ({
        ...log,
        status: 'generating',
        pollingState: 'active',
        error: undefined,
      }));

      const pollResult = initialLog.generationJobId ? await pollGeneration(initialLog.generationJobId, undefined, job=>updateCurrentLog(projectId,logId,log=>({...log,providerTaskId:job.taskId,normalizedStatus:job.status,finalCost:job.finalCost}))) : await pollKieTask({
        taskId,
        isVeo,
        headers,
        onTransientError: (message) => updateCurrentLog(projectId, logId, (log) => ({
          ...log,
          status: 'generating',
          pollingState: 'retrying',
          error: `Unable to check task status. Will retry automatically. ${message}`,
        })),
      });

      if (!pollResult.completed) {
        updateLogForProject(projectId, logId, initialLog, (log) => ({
          ...log,
          status: 'failed',
          normalizedStatus: 'stalled',
          pollingState: 'timed-out',
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - new Date(log.timestamp).getTime(),
          error: 'Automatic status checks timed out. Check the provider once more or stop tracking this task.',
        }));
        return;
      }

      const resultData = pollResult.resultData;
      if (type === 'text') {
        textResult = normalizeTextResult(resultData || pollResult.taskData || initialLog.textResult || '');
      } else {
        mediaUrls = normalizeResultUrls(resultData);
        mediaUrl = mediaUrls[0] || '';
      }

      if (type === 'text') {
        if (!textResult) {
          throw new Error('No ID or text result returned after generation success');
        }

        updateLogForProject(projectId, logId, initialLog, (log) => ({
          ...log,
          status: 'success',
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - new Date(log.timestamp).getTime(),
          textResult,
          pollingState: undefined,
          error: undefined,
        }));
        fetchCredits();
        return;
      }

      if (!mediaUrl) {
        throw new Error('No media URL returned after generation success');
      }

      if (cancelledLogKeysRef.current.has(pollKey)) return;
      fetchCredits();
      const localMediaUrls = await Promise.all(mediaUrls.map((url) => saveGeneratedMedia(url, type === 'video' ? 'video' : type === 'audio' ? 'audio' : 'image', projectId)));
      if (cancelledLogKeysRef.current.has(pollKey)) return;

      updateLogForProject(projectId, logId, initialLog, (log) => ({
        ...log,
        status: 'success',
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(log.timestamp).getTime(),
        mediaUrl: localMediaUrls[0],
        mediaUrls: localMediaUrls,
        pollingState: undefined,
        error: undefined,
      }));
    } catch (error: any) {
      updateLogForProject(projectId, logId, initialLog, (log) => ({
        ...log,
        status: 'failed',
        pollingState: undefined,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(log.timestamp).getTime(),
        error: error.message || 'Generation task failed',
      }));
    } finally {
      activePollsRef.current.delete(pollKey);
    }
  };

  const resumeTask = (logId: string) => {
    const log = logs.find((item) => item.id === logId);
    if (!currentProjectId || !log?.taskId || (log.status !== 'generating' && log.pollingState !== 'timed-out')) return;
    void pollTaskResult(log.id, log.taskId, log.modelId, log.type, currentProjectId, log);
  };

  useEffect(() => {
    if (!historyLoaded || loadedProjectId !== currentProjectId) return;
    const projectId = currentProjectId;
    logs.forEach((log) => {
      if (log.status === 'generating' && log.taskId && log.pollingState !== 'timed-out') {
        pollTaskResult(log.id, log.taskId, log.modelId, log.type, projectId, log);
      }
    });
  }, [historyLoaded, loadedProjectId, currentProjectId, logs]);

  const handleGenerate = async (prompt: string, imageBase64?: string, videoBase64?: string, params?: Record<string, any>) => {
    const generationModel = params?.__studioModel ? SUPPORTED_MODELS.find(m => m.logicalId === params.__studioModel) : selectedModel;
    if (!generationModel || generationModel.unavailableReason) throw new Error('Selected production model is unavailable');
    if (!currentProjectId) {
      alert('Open or create a project before generating media.');
      return;
    }
    const projectId = currentProjectId;

    const fileParamKeys = new Set<string>((generationModel.params || []).filter(param => param.type === 'file').map(param => param.key));
    if (generationModel.supportsImageUpload) fileParamKeys.add(generationModel.imageInputKey || 'image_urls');
    if (generationModel.supportsVideoUpload) fileParamKeys.add(generationModel.videoInputKey || 'video_urls');
    const sourceType = params?.__sourceType || (videoBase64 ? 'video' : imageBase64 ? 'image' : undefined);
    const submissionSignature = buildGenerationSignature(generationModel, prompt, imageBase64, videoBase64, params);
    const now = Date.now();
    if (createTaskInFlightRef.current) {
      if (params?.__studioShotId) throw new Error('Another generation is being submitted. Wait before starting this batch.');
      console.warn('Ignored duplicate generate request while a task create request is already in flight.');
      return;
    }
    if (
      lastSubmissionRef.current?.signature === submissionSignature &&
      now - lastSubmissionRef.current.timestamp < 30_000
    ) {
      if (params?.__studioShotId) throw new Error('This take was submitted recently. Review its status before generating again.');
      console.warn('Ignored duplicate generate request with the same payload.');
      return;
    }

    createTaskInFlightRef.current = true;
    setIsCreateTaskPending(true);
    lastSubmissionRef.current = { signature: submissionSignature, timestamp: now };

    const h3PromptMode=params?.__h3PromptMode as GenerationLog['h3PromptMode'];
    const originalPrompt=typeof params?.__h3OriginalPrompt==='string'?params.__h3OriginalPrompt:prompt;
    const logEntry: GenerationLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      modelId: generationModel.id,
      modelName: generationModel.name,
      provider: generationModel.provider,
      productionShotId: params?.__studioShotId,
      prompt: originalPrompt,
      sourceMediaUrls: [...new Set(localMediaUrls([imageBase64, videoBase64, [...fileParamKeys].map(key => params?.[key])]))],
      h3PromptMode,
      h3PairId: typeof params?.__h3PairId==='string'?params.__h3PairId:undefined,
      enhancedPrompt: h3PromptMode==='enhanced'?prompt:undefined,
      status: 'generating',
      pollingState: 'active',
      type: generationModel.category === 'text-to-text'
        ? 'text'
        : generationModel.category === 'text-to-audio' ? 'audio'
        : generationModel.category.includes('video') ? 'video' : 'image',
    };

    setLogs((prev) => [logEntry, ...prev]);
    setActiveLogId(logEntry.id);

    try {
      const headers = getKieHeaders();
      const routing = {policy:params?.__policy || 'auto',provider:params?.__provider};
      const selection = await jsonRequest('/api/generation/estimate',{logicalModel:resolveModel(generationModel).logicalId,input:{prompt:prompt.trim(),...params},sourceType,sourceDuration:params?.__sourceDuration,...routing});

      // Helper to upload base64 to our server which proxies to tmpfiles for a public URL
      const getPublicUrl = async (dataUrl: string) => {
        if (!dataUrl) return dataUrl;
        let uploadDataUrl = dataUrl;

        if (!uploadDataUrl.startsWith('data:') && (uploadDataUrl.startsWith('/library/') || uploadDataUrl.startsWith('/projects/') || uploadDataUrl.startsWith('blob:'))) {
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
            throw new Error('Unable to read reference media. Add the file again.');
          }
        }

        if (!uploadDataUrl.startsWith('data:')) return uploadDataUrl;

        try {
          const res = await fetch(selection.provider === 'higgsfield' ? '/api/providers/higgsfield/upload' : '/api/upload-temp', {
             method: 'POST',
             headers,
             body: JSON.stringify({ dataUrl: uploadDataUrl })
          });
          if (res.ok) {
            const data = await res.json();
            if (!data.url) throw new Error('Upload returned no public URL');
            return data.url;
          }
        } catch(e) {
          throw new Error('Reference upload failed. Check provider credentials and file type.');
        }
        throw new Error('Reference upload failed. Check provider credentials and file type.');
      };

      // Ensure we have public URLs for services that reject base64 (e.g., KIE missing base64 support for grok-imagine)
      const finalVideoStr = videoBase64 ? await getPublicUrl(videoBase64) : '';
      const finalImageStr = imageBase64 ? await getPublicUrl(imageBase64) : '';

      const normalizedParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(params || {})) {
        if (key.startsWith('__') || value === '' || value === null || value === undefined) continue;
        const shouldResolveMediaUrl = fileParamKeys.has(key);
        const normalizedValue = shouldResolveMediaUrl && Array.isArray(value)
          ? await Promise.all(value.map((item) => typeof item === 'string' ? getPublicUrl(item) : item))
          : typeof value === 'string' && (value.startsWith('data:') || shouldResolveMediaUrl)
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

      inputPayload.__sourceImage = finalImageStr;
      inputPayload.__sourceVideo = finalVideoStr;

      const job = await jsonRequest('/api/generation/jobs', {
        logicalModel: resolveModel(generationModel).logicalId, input: compactInput(inputPayload),
        policy:'manual', provider:selection.provider, projectId, historyId:logEntry.id,
        sourceMediaUrls: logEntry.sourceMediaUrls,
        productionShotId: logEntry.productionShotId,
        sourceType,
        sourceDuration:params?.__sourceDuration,
      });
      const taskId = job.id;
      const taskLog = {...logEntry,taskId,generationJobId:job.id,logicalModel:job.logicalModel,provider:job.provider,normalizedStatus:job.status,settingsSnapshot:{prompt:originalPrompt,...normalizedParams,...(h3PromptMode?{h3PromptMode,h3PairId:params?.__h3PairId,h3Plan:params?.__h3Plan}:{}),...(h3PromptMode==='enhanced'?{enhancedPrompt:prompt}:{})},estimatedCost:job.estimatedCost};
      if (currentProjectIdRef.current === projectId) {
        setLogs((prev) => prev.map((l) => (l.id === logEntry.id ? taskLog : l)));
      } else if (!cancelledLogKeysRef.current.has(logKey(projectId, logEntry.id))) {
        void historyApi.saveLog(projectId, taskLog).catch((error) => {
          console.warn('Failed to persist background task id.', error);
        });
      }
      if (!cancelledLogKeysRef.current.has(logKey(projectId, logEntry.id))) {
        void pollTaskResult(logEntry.id, taskId, generationModel.id, logEntry.type, projectId, taskLog);
      }
    } catch (error: any) {
      updateLogForProject(projectId, logEntry.id, logEntry, (log) => ({
        ...log,
        status: 'failed',
        pollingState: undefined,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(log.timestamp).getTime(),
        error: error.message || 'Unable to create generation task',
      }));
      if (params?.__studioShotId) throw error;
    }
    finally {
      createTaskInFlightRef.current = false;
      setIsCreateTaskPending(false);
    }
  };

  const createProject = async (name: string) => {
    try {
      const res = await fetch(projectApiUrl('/api/projects'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.project?.id) {
        throw new Error(data.error || 'Failed to create project');
      }
      setProjects((current) => [data.project, ...current.filter((project) => project.id !== data.project.id)]);
      setCurrentProjectId(data.project.id);
    } catch (error: any) {
      alert(error.message || 'Unable to create project.');
    }
  };

  const renameProject = async (projectId: string, name: string) => {
    try {
      const res = await fetch(projectApiUrl(`/api/projects/${encodeURIComponent(projectId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.project?.id) {
        throw new Error(data.error || 'Failed to rename project');
      }
      await refreshProjects();
    } catch (error: any) {
      alert(error.message || 'Unable to rename project.');
    }
  };

  const handleProjectDialogSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectDialog) return;
    const name = projectDialog.name.trim() || 'Untitled Project';
    if (projectDialog.mode === 'create') {
      await createProject(name);
    } else if (projectDialog.projectId) {
      await renameProject(projectDialog.projectId, name);
    }
    setProjectDialog(null);
  };

  const handleClearProject = async (project = currentProject) => {
    if (!project) return;
    const projectId = project.id;
    if (!window.confirm(`Clear all generations and their saved media from "${project.name}"? Imported library assets will remain. This cannot be undone. Export a backup first if you may need these files later.`)) return;
    const projectLogs = projectId === currentProjectId ? logs : [];
    const cancelledKeys = projectLogs.map((log) => logKey(projectId, log.id));
    cancelledKeys.forEach((key) => cancelledLogKeysRef.current.add(key));

    try {
      await historyApi.clear(projectId);
      if (currentProjectIdRef.current === projectId) {
        persistedLogSignaturesRef.current.clear();
        setLogs([]);
        setActiveLogId(null);
        setHistorySaveError('');
      }
      await refreshProjects();
    } catch (error: any) {
      cancelledKeys.forEach((key) => cancelledLogKeysRef.current.delete(key));
      alert(error.message || 'Unable to clear project.');
    }
  };

  const handleExportProject = (project: Project) => {
    const link = document.createElement('a');
    link.href = projectApiUrl(`/api/projects/${encodeURIComponent(project.id)}/export`);
    link.download = `${project.name}-backup.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleCloseProject = () => {
    setCurrentProjectId(null);
    setLoadedProjectId(null);
    localStorage.removeItem('kie_current_project_id');
    setLogs([]);
    persistedLogSignaturesRef.current.clear();
    setHistorySaveError('');
  };

  const chooseWorkflow = (next:Workflow, openBrowser = false) => {
    const candidates=SUPPORTED_MODELS.filter(m=>supportsWorkflow(m,next)&&!m.unavailableReason&&(next!=='tools'||m.category.includes('video')===selectedModel.category.includes('video')));
    const candidate=candidates.find(m=>m.familyId&&m.familyId===selectedModel.familyId)||candidates.find(m=>m.provider===selectedModel.provider)||candidates[0];
    setWorkflow(next);
    if(candidate){selectModel(candidate,next);setPage(candidate.category==='text-to-audio'?'Audio':candidate.category.includes('video')?'Video':'Image');}
    if(next==='text-to-video'||next==='text-to-image')setSourceAsset(null);
    else if(candidate&&sourceAsset?.type==='image') {
      const role = next === 'reference' ? 'reference' : sourceAsset.imageRole === 'last' || imageInputRole(sourceAsset.parameterKey || '') === 'last' ? 'last' : 'first';
      const target = imageDestination(candidate, role);
      setSourceAsset(target ? {...sourceAsset, id:crypto.randomUUID(), parameterKey:target.param?.key, imageRole:role} : null);
    }
    if(openBrowser)openPane('left');
  };
  const animateImage = (log:GenerationLog, asReference=false) => {
    const next:Workflow=asReference?'reference':'image-to-video';
    const candidate=SUPPORTED_MODELS.find(m=>supportsWorkflow(m,next)&&!m.unavailableReason&&(m.supportsImageUpload||firstImageParameter(m,next)));
    if(!candidate || !log.mediaUrl)return;
    selectModel(candidate,next);setPage('Video');setActiveLogId(null);
    setSourceAsset({id:crypto.randomUUID(),type:'image',url:log.mediaUrl,label:asReference?'Reference image':'Starting image',parameterKey:firstImageParameter(candidate,next)?.key});
    setInspected(null);setLeftPaneOpen(true);
  };
  const useProductionAsset = (asset: ProductionAsset, action: 'animate' | 'reference' | 'input' | 'send') => {
    if (action === 'send') {if (asset.kind === 'video') handleGrabVideoFrame(asset.url); else if (asset.kind === 'image') setTransferImage(asset.url); return;}
    if (asset.kind === 'image' && action !== 'input') {
      animateImage({mediaUrl: asset.url} as GenerationLog, action === 'reference');
      return;
    }
    const accepts = (model: AIModel) => !resolveModel(model)?.unavailableReason && model.category !== 'text-to-audio' &&
      (asset.kind === 'image' && model.supportsImageUpload || asset.kind === 'video' && model.supportsVideoUpload ||
        (model.params || []).some(p => p.type === 'file' && p.accept?.includes(asset.kind)));
    const candidate = accepts(selectedModel) ? selectedModel : SUPPORTED_MODELS.find(accepts);
    if (!candidate) {alert(`No enabled model accepts ${asset.kind} inputs.`); return;}
    const parameter = candidate.params?.find(p => p.type === 'file' && p.accept?.includes(asset.kind));
    selectModel(candidate); setPage(candidate.category.includes('video') ? 'Video' : 'Image'); setActiveLogId(null);
    setSourceAsset({id:crypto.randomUUID(), type:asset.kind, url:asset.url, label:asset.name,
      parameterKey: asset.kind === 'audio' || !(asset.kind === 'image' ? candidate.supportsImageUpload : candidate.supportsVideoUpload) ? parameter?.key : undefined});
    setInspected(null);
  };
  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      <aside className="flex w-20 sm:w-48 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/60 p-3">
        <div className="px-2 py-5 font-semibold text-violet-300"><span className="sm:hidden">Kai</span><span className="hidden sm:inline">Kai Media Studio</span></div>
        <nav className="flex flex-col gap-2">{['Home','Image','Video','Audio','Studio','Library','Projects','Settings'].map(item => <button key={item} onClick={() => {
          if(item === 'Settings') {setShowSettings(true);return;}
          if(item === 'Image' || item === 'Video' || item === 'Audio')openCreationSection(item.toLowerCase() as StudioSection);else setPage(item);
        }} className={`text-left rounded-xl px-2 sm:px-3 py-3 text-xs sm:text-sm ${page===item ? 'bg-violet-500/15 text-violet-300':'text-neutral-400 hover:bg-neutral-800'}`}>{item}</button>)}</nav>
        <div className="mt-auto space-y-2">
          <button type="button" onClick={fetchCredits} title={creditError || 'Refresh Kie credit balance'} aria-label="Refresh Kie credit balance" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
            <Wallet className="h-4 w-4 shrink-0 text-violet-300"/>
            <span className="truncate sm:hidden">{isLoadingCredits ? '…' : credits ?? '—'}</span>
            <span className="hidden truncate sm:inline">Kie · {isLoadingCredits ? 'Checking…' : creditError ? 'Unavailable' : `${credits ?? '—'} credits`}</span>
          </button>
          <div className="hidden p-2 text-xs text-neutral-500 sm:block">{currentProject?.name || 'Creative workspace'}</div>
        </div>
      </aside>
      {leftPaneOpen && <ModelBrowser modality={page === 'Image' ? 'image' : page === 'Video' ? 'video' : page === 'Audio' ? 'audio' : undefined} initialWorkflow={workflow} hasReference={!!sourceAsset} onClose={()=>closePane('left')} onSelect={(model,nextWorkflow)=>{
        const role = sourceAsset?.imageRole || (sourceAsset?.parameterKey ? imageInputRole(sourceAsset.parameterKey) : undefined);
        const target = role ? imageDestination(model, role) : undefined;
        if (sourceAsset?.type === 'image' && role && !target) {alert(`This model does not accept the selected ${role === 'last' ? 'end frame' : role + ' image'}. Choose a compatible model or start a new creation.`); return;}
        selectModel(model, target?.workflow || nextWorkflow);setPage(model.category==='text-to-audio'?'Audio':model.category.includes('video')?'Video':'Image');
        if(sourceAsset?.type==='image')setSourceAsset({...sourceAsset,id:crypto.randomUUID(),parameterKey:target?.param?.key || (!role ? firstImageParameter(model,nextWorkflow)?.key : undefined)});
        closePane('left');
      }}/>}
      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-neutral-950 relative">
        {['Home','Library','Projects','Studio'].includes(page) ? <div className="overflow-y-auto flex-1 p-5 sm:p-10">
          <div className="flex items-center justify-between mb-8"><h1 className="text-2xl font-semibold">{page === 'Home' ? 'What will you create today?' : page}</h1><button className="text-sm text-neutral-400" onClick={()=>openPane('right')}>Activity · {logs.filter(l=>l.status==='generating').length}</button></div>
          {page === 'Home' && <div className="grid sm:grid-cols-3 gap-4 mb-10">{(['Image','Video','Audio'] as const).map(item=><button key={item} className="text-left p-7 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/15 to-neutral-900" onClick={()=>openCreationSection(item.toLowerCase() as StudioSection)}><h2 className="text-xl">Create {item}</h2><p className="text-sm text-neutral-400 mt-2">{item==='Image'?'Explore a visual idea, edit or build a reference.':item==='Video'?'Bring a scene or still image to life.':'Turn a script into directed speech.'}</p></button>)}</div>}
          {page === 'Home' && <section className="mb-8"><div className="flex justify-between mb-3"><h2 className="text-neutral-300">Your projects</h2><button className="text-violet-300 text-sm" onClick={()=>setProjectDialog({mode:'create',name:'New project'})}>+ New project</button></div><div className="flex gap-3 flex-wrap">{projects.map(p=><button key={p.id} className={`rounded-lg border px-4 py-3 text-sm ${p.id===currentProjectId?'border-violet-500 text-violet-200':'border-neutral-800'}`} onClick={()=>setCurrentProjectId(p.id)}>{p.name}</button>)}</div></section>}
          {page === 'Studio' && (currentProjectId && loadedProjectId === currentProjectId && historyLoaded ? <div key={currentProjectId}><ProductionStudio projectId={currentProjectId} logs={logs} onGenerate={handleGenerate}/></div> : <p>Open a project to use Studio.</p>)}
          {page === 'Projects' && <section><div className="flex items-center justify-between gap-4 mb-5"><div><h2 className="text-lg text-neutral-200">Project backups</h2><p className="text-sm text-neutral-500 mt-1">Export before clearing to keep the project history and original media together.</p></div><button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400" onClick={()=>setProjectDialog({mode:'create',name:'New project'})}>+ New project</button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{projects.map(project=><article key={project.id} className={`rounded-xl border p-5 ${project.id===currentProjectId?'border-violet-500/70 bg-violet-500/5':'border-neutral-800 bg-neutral-900'}`}><div className="mb-5"><h3 className="font-medium text-neutral-100">{project.name}</h3><p className="mt-1 text-xs text-neutral-500">Updated {new Date(project.updatedAt).toLocaleString()}</p>{project.id===currentProjectId&&<span className="mt-3 inline-block rounded-full bg-violet-500/15 px-2 py-1 text-xs text-violet-300">Open now</span>}</div><div className="grid grid-cols-2 gap-2"><button className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800" onClick={()=>setCurrentProjectId(project.id)}>Open</button><button className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800" onClick={()=>setProjectDialog({mode:'rename',name:project.name,projectId:project.id})}><Edit3 className="mr-2 inline h-3.5 w-3.5"/>Rename</button><button className="rounded-lg bg-violet-500/15 px-3 py-2 text-sm text-violet-200 hover:bg-violet-500/25" onClick={()=>handleExportProject(project)}><Download className="mr-2 inline h-3.5 w-3.5"/>Export backup</button><button className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10" onClick={()=>handleClearProject(project)}><Trash2 className="mr-2 inline h-3.5 w-3.5"/>Clear</button></div></article>)}</div></section>}
          {page === 'Library' && <><h2 className="mb-4 text-neutral-300">Project library</h2>{currentProjectId && loadedProjectId === currentProjectId && historyLoaded ? <div key={currentProjectId}><ProductionLibrary projectId={currentProjectId} logs={logs} onUse={useProductionAsset} onUseVideoFrame={handleGrabVideoFrame} onHistoryChanged={(serverLogs, changedIds) => {
            const projectId = currentProjectId;
            const changed = new Set(changedIds);
            const updates = new Map(serverLogs.filter(log => changed.has(log.id)).map(log => [log.id, log]));
            for (const id of changed) {
              if (updates.has(id)) persistedLogSignaturesRef.current.set(id, JSON.stringify(updates.get(id)));
              else {persistedLogSignaturesRef.current.delete(id); cancelledLogKeysRef.current.add(logKey(projectId, id));}
            }
            setLogs(current => current.flatMap(log => !changed.has(log.id) ? [log] : updates.has(log.id) ? [updates.get(log.id)!] : []));
            setActiveLogId(null);
          }}/></div> : <p className="text-neutral-500">{currentProjectId ? 'Loading project…' : 'Open a project to use its library.'}</p>}</>}
          {page === 'Home' && <><h2 className="mb-4 text-neutral-300">Recent generations</h2><LibraryGallery logs={logs} onInspect={log=>{setActiveLogId(log.id);setInspected(log);}} onAnimate={log=>animateImage(log)} onReference={log=>animateImage(log,true)} onDelete={handleDeleteLogs} onExport={handleExportLogs}/></>}
          {page==='Home' && <p className="text-xs text-neutral-500 mt-8">{logs.length} generations in this project</p>}
        </div> : page==='Audio' ? <AudioWorkspace model={selectedModel} latestLog={activeLog} isSubmitting={isCreateTaskPending} onGenerate={handleGenerate} onOpenModelPane={()=>openPane('left')} onOpenActivityPane={()=>openPane('right')} onStartNew={()=>setActiveLogId(null)}/> : <MediaWorkspace
          projectId={currentProjectId}
          onUseVideoFrame={handleGrabVideoFrame}
          onUseImage={url => setTransferImage(url)}
          workflow={workflow}
          onWorkflowChange={chooseWorkflow}
          selectedModel={selectedModel} 
          autoplayVideos={autoplayVideos}
          onGenerate={handleGenerate} 
          isSubmitting={isCreateTaskPending}
          latestLog={activeLog}
          sourceAsset={sourceAsset}
          isCompactLayout={isCompactLayout}
          onOpenModelPane={() => openPane('left')}
          onOpenActivityPane={() => openPane('right')}
          onRevealFile={handleRevealFile}
          remix={remix}
          onInspect={()=>activeLog && setInspected(activeLog)}
          onStartNew={()=>{setActiveLogId(null);setSourceAsset(null);}}
        />}
      </div>

      {rightPaneOpen && <button onClick={()=>closePane('right')} className="fixed inset-0 z-30 bg-black/40" aria-label="Close activity drawer"/>}
      {/* Right Sidebar - Activity Log */}
      {rightPaneOpen ? (
        <div
          className={isCompactLayout
            ? 'fixed inset-y-0 right-0 z-40 flex shrink-0 flex-col border-l border-neutral-800 bg-neutral-900 shadow-2xl'
            : 'fixed inset-y-0 right-0 z-40 flex shrink-0 flex-col border-l border-neutral-800 bg-neutral-900 shadow-2xl'}
          style={{ width: 'min(90vw, 390px)' }}
        >
          <div className="p-4 border-b border-neutral-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => closePane('right')}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-100"
                title="Collapse activity pane"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
              <h2 className="min-w-0 flex-1 truncate font-medium text-sm text-neutral-400 uppercase tracking-wider">Activity Log</h2>
              <button
                onClick={() => setProjectDialog({ mode: 'create', name: `Project ${projects.length + 1}` })}
                className="h-8 w-8 rounded-md bg-indigo-500 text-white grid place-items-center hover:bg-indigo-400 transition-colors"
                title="New project"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <FolderOpen className="w-3.5 h-3.5 text-indigo-300" />
                <span>Project</span>
              </div>
              <select
                value={currentProjectId || ''}
                onChange={(event) => setCurrentProjectId(event.target.value || null)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-2 py-2 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="">No project open</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => currentProject && setProjectDialog({ mode: 'rename', name: currentProject.name, projectId: currentProject.id })}
                  disabled={!currentProject}
                  className="h-8 rounded-md border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
                  title="Rename project"
                >
                  <Edit3 className="w-3.5 h-3.5 mx-auto" />
                </button>
                <button
                  onClick={() => handleClearProject()}
                  disabled={!currentProject || logs.length === 0}
                  className="h-8 rounded-md border border-neutral-800 text-neutral-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40 disabled:hover:bg-transparent"
                  title="Clear project log"
                >
                  <Trash2 className="w-3.5 h-3.5 mx-auto" />
                </button>
                <button
                  onClick={handleCloseProject}
                  disabled={!currentProject}
                  className="h-8 rounded-md border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
                  title="Close project"
                >
                  <X className="w-3.5 h-3.5 mx-auto" />
                </button>
              </div>
            </div>
          </div>
          {historySaveError && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
              <span className="min-w-0 flex-1">{historySaveError}</span>
              <button
                type="button"
                onClick={() => {
                  setHistorySaveError('');
                  setHistoryRetryToken((value) => value + 1);
                }}
                className="shrink-0 font-medium text-red-200 underline underline-offset-2 hover:text-white"
              >
                Retry
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {currentProject ? (
              <ActivityLog
                logs={logs}
                activeLogId={activeLog?.id}
                autoplayVideos={autoplayVideos}
                onSelectLog={id=>{setActiveLogId(id);const log=logs.find(l=>l.id===id);setPage(log?.type==='video'?'Video':log?.type==='audio'?'Audio':'Image');setRightPaneOpen(false);}}
                onUseAsSource={useAsSource}
                onGrabVideoFrame={handleGrabVideoFrame}
                onRevealFile={handleRevealFile}
                onDeleteLog={handleDeleteLog}
                onCancelLog={handleStopTracking}
                onResumeLog={resumeTask}
              />
            ) : (
              <div className="p-8 text-center text-sm text-neutral-500">
                Open or create a project to view activity.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {projectDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <form
            onSubmit={handleProjectDialogSubmit}
            className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">
                  {projectDialog.mode === 'create' ? 'New Project' : 'Rename Project'}
                </h3>
                <p className="text-xs text-neutral-500 mt-1">Project logs and library media stay separate.</p>
              </div>
              <button
                type="button"
                onClick={() => setProjectDialog(null)}
                className="p-2 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <label className="space-y-2 block">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Project Name</span>
                <input
                  autoFocus
                  value={projectDialog.name}
                  onChange={(event) => setProjectDialog((current) => current ? { ...current, name: event.target.value } : current)}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500"
                  placeholder="Untitled Project"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setProjectDialog(null)}
                  className="px-4 py-2 rounded-lg border border-neutral-800 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-500 text-sm font-medium text-white hover:bg-indigo-400"
                >
                  {projectDialog.mode === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {inspected && <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-5" role="dialog" aria-modal="true" aria-label="Result inspector" onKeyDown={e=>{if(e.key==='Escape')setInspected(null);}}>
        <div className="flex justify-between items-center mb-3"><h2>{inspected.modelName}</h2><button autoFocus onClick={()=>setInspected(null)} aria-label="Close result inspector">✕ Close</button></div>
        <div className="min-h-0 flex-1 flex justify-center items-center">{inspected.mediaUrl ? inspected.type==='video'?<video ref={inspectorVideoRef} controls src={inspected.mediaUrl} className="max-h-full max-w-full"/>:inspected.type==='audio'?<audio controls src={inspected.mediaUrl} className="w-full max-w-2xl"/>:<img src={inspected.mediaUrl} alt={inspected.prompt} className="max-h-full max-w-full object-contain"/>:<p>{inspected.error || 'Generation in progress'}</p>}</div>
        <p className="text-sm text-neutral-400 my-3">{inspected.prompt}</p>
        <div className="flex gap-3 flex-wrap text-sm">
          {inspected.mediaUrl && <a className="px-3 py-2 rounded bg-neutral-800" href={`/api/download?url=${encodeURIComponent(inspected.mediaUrl)}&filename=${inspected.id}.${inspected.type==='video'?'mp4':inspected.type==='audio'?'mp3':'png'}`}>Download</a>}
          <button className="px-3 py-2 rounded bg-neutral-800" onClick={()=>{const m=SUPPORTED_MODELS.find(m=>m.id===inspected.modelId);if(m)selectModel(m);setPage(inspected.type==='video'?'Video':inspected.type==='audio'?'Audio':'Image');setRemix({id:crypto.randomUUID(),prompt:inspected.prompt,settings:inspected.settingsSnapshot || {}});setInspected(null);}}>Remix</button>
          {inspected.mediaUrl && inspected.type === 'video' && <button className="rounded bg-violet-500/20 px-3 py-2 text-violet-200" onClick={() => {inspectorVideoRef.current?.pause(); handleGrabVideoFrame(inspected.mediaUrl!, inspectorVideoRef.current?.currentTime || 0);}}>Use video frame…</button>}
          {inspected.mediaUrl && inspected.type === 'image' && <button className="rounded bg-violet-500/20 px-3 py-2 text-violet-200" onClick={() => {setTransferImage(inspected.mediaUrl!); setInspected(null);}}>Send image to model…</button>}
        </div>
      </div>}
      <SettingsModal
        isOpen={showSettings}
        autoplayVideos={autoplayVideos}
        theme={theme}
        onClose={() => setShowSettings(false)}
        onSaveSettings={(nextAutoplayVideos, nextTheme) => {
          setAutoplayVideos(nextAutoplayVideos);
          setTheme(nextTheme);
          fetchCredits();
        }}
      />

      {frameGrabber && <MediaSourcePicker projectId={currentProjectId} title="Pick a video frame" initialVideo={frameGrabber} onClose={() => setFrameGrabber(null)} onChoose={url => {setFrameGrabber(null); setTransferImage(url);}}/>}
      {transferImage && <ImageDestinationDialog url={transferImage} models={SUPPORTED_MODELS} selectedModel={selectedModel} onClose={() => setTransferImage(null)} onChoose={(model, role) => {
        const target = imageDestination(model, role);
        if (!target) return;
        selectModel(model, target.workflow); setPage(model.category.includes('video') ? 'Video' : 'Image');
        setSourceAsset({id: crypto.randomUUID(), type: 'image', url: transferImage, parameterKey: target.param?.key, imageRole: role, label: role});
        setTransferImage(null); setInspected(null); setRightPaneOpen(false);
      }}/>}
    </div>
  );
}
