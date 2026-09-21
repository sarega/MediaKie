import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AIModel, GenerationLog, ModelParamConfig, estimateModelCredits } from '../types';
import { AlertCircle, Sparkles, Upload, Download, FolderOpen, Loader2, Settings2, Wallet, Link2, Copy, Search, Check, Film, Scissors, Play, Pause, Trash2, StepBack, StepForward, PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import {WORKFLOWS,firstImageParameter,type Workflow} from '../models/workflows';
import { ComposerControls } from '../ui/composer/Controls';
import { resolveModel, parametersFor, type RoutingPolicy, type ProviderId } from '../models/registry';
import { jsonRequest } from '../generation/client';
import { ClypraEditorHost } from './ClypraEditorHost';

const USE_CLYPRA_EDITOR = import.meta.env.VITE_USE_CLYPRA_EDITOR === 'true';

interface Props {
  workflow:Workflow;
  onWorkflowChange:(workflow:Workflow)=>void;
  onInspect?: () => void;
  onStartNew?: () => void;
  remix?: {id:string;prompt:string;settings:Record<string,any>} | null;
  selectedModel: AIModel;
  autoplayVideos: boolean;
  onGenerate: (prompt: string, imageBase64?: string, videoBase64?: string, params?: Record<string, any>) => void;
  isSubmitting: boolean;
  latestLog?: GenerationLog;
  sourceAsset?: { id: string; type: 'image' | 'video'; url: string; label?: string; parameterKey?: string } | null;
  isCompactLayout?: boolean;
  onOpenModelPane?: () => void;
  onOpenActivityPane?: () => void;
  onRevealFile?: (url: string) => void;
}

type EditorClip = {
  id: string;
  url: string;
  label: string;
  duration: number;
  start: number;
  end: number;
};

const formatSeconds = (value: number) => {
  if (!Number.isFinite(value)) return '0.0s';
  return `${Math.max(0, value).toFixed(1)}s`;
};

const previewJsonValue = (value: any): any => {
  if (typeof value === 'string' && value.startsWith('data:')) {
    const separator = value.indexOf(';');
    return `[${separator > 5 ? value.slice(5, separator) : 'uploaded file'}]`;
  }
  if (Array.isArray(value)) return value.map(previewJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, previewJsonValue(item)]));
  }
  return value;
};

const isLocalLibraryUrl = (url: string) => url.startsWith('/library/') || url.startsWith('/projects/');

export function MediaWorkspace({ workflow,onWorkflowChange,onInspect, onStartNew, remix, selectedModel: baseModel, autoplayVideos, onGenerate, isSubmitting, latestLog, sourceAsset, isCompactLayout = false, onOpenModelPane, onOpenActivityPane, onRevealFile }: Props) {
  const [policy,setPolicy] = useState<RoutingPolicy>('auto');
  const [provider,setProvider] = useState('kie');
  const selectedModel = useMemo(()=>({...baseModel,params:parametersFor(baseModel,policy==='manual'?provider as ProviderId:undefined)}),[baseModel,policy,provider]);
  const [workspaceMode, setWorkspaceMode] = useState<'create' | 'edit'>('create');
  const [prompt, setPrompt] = useState('');
  
  // Base64 files
  const [fileData, setFileData] = useState<{ type: 'image' | 'video', bgUrl: string, b64: string, duration?: number } | null>(null);
  
  // Custom Parameters
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [providerRevision,setProviderRevision] = useState(0);
  const [estimate,setEstimate] = useState<any>(null);
  const [estimateError,setEstimateError] = useState('');
  const [settingsView, setSettingsView] = useState<'form' | 'json'>('form');
  const initializedModelRef = useRef('');
  const [openVoiceParamKey, setOpenVoiceParamKey] = useState<string | null>(null);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [editorClips, setEditorClips] = useState<EditorClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState('');
  const [isPreviewingTimeline, setIsPreviewingTimeline] = useState(false);
  const [previewClipIndex, setPreviewClipIndex] = useState(0);
  const [exportStatus, setExportStatus] = useState('');

  useEffect(() => {
    if (!showSettings) return;
    const closeSettingsOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSettings(false);
    };
    window.addEventListener('keydown', closeSettingsOnEscape);
    return () => window.removeEventListener('keydown', closeSettingsOnEscape);
  }, [isCompactLayout, showSettings]);

  useEffect(()=>{if(!sourceAsset)setFileData(null);},[sourceAsset]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const uploadAccept = selectedModel.supportsImageUpload && selectedModel.supportsVideoUpload
    ? 'image/*,video/*'
    : selectedModel.supportsVideoUpload
      ? 'video/*'
      : 'image/*';

  const readVideoDuration = (url: string) => new Promise<number | undefined>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : undefined);
    video.onerror = () => resolve(undefined);
    video.src = url;
  });

  useEffect(() => {
    const modelKey = `${selectedModel.category}:${selectedModel.id}:${policy==='manual'?provider:'auto'}:${workflow}`;
    const storageKey = `kie_model_params:${modelKey}`;

    if (initializedModelRef.current !== modelKey) {
      initializedModelRef.current = modelKey;
      let saved: Record<string, any> = {};
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      } catch {
        localStorage.removeItem(storageKey);
      }
      setParamValues(Object.fromEntries((selectedModel.params || []).map((param) => [
        param.key,
        param.type !== 'file' && param.key in saved ? saved[param.key] : param.defaultValue,
      ])));
      return;
    }
    if ((selectedModel.params || []).some((param) => !(param.key in paramValues))) return;

    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(
      (selectedModel.params || []).filter((param) => param.type !== 'file').map((param) => [param.key, paramValues[param.key]])
    )));
  }, [selectedModel, paramValues]);

  useEffect(() => {
    if (!sourceAsset) return;
    if (sourceAsset.parameterKey) {setParamValues(current=>({...current,[sourceAsset.parameterKey!]:sourceAsset.url}));return;}
    const isSupported = sourceAsset.type === 'image'
      ? selectedModel.supportsImageUpload
      : selectedModel.supportsVideoUpload;
    if (!isSupported) {setFileData(null);return;}
    setFileData({
      type: sourceAsset.type,
      bgUrl: sourceAsset.url,
      b64: sourceAsset.url,
    });
    if (sourceAsset.type === 'video') {
      void readVideoDuration(sourceAsset.url).then((duration) => {
        if (duration === undefined) return;
        setFileData((current) => current?.type === 'video' && current.b64 === sourceAsset.url ? { ...current, duration } : current);
      });
    }
  }, [sourceAsset, selectedModel]);

  const handleGenerate = () => {
    if (!prompt.trim() && !fileData && !selectedModel.allowsPromptlessGeneration) return;
    
    const imageB64 = fileData?.type === 'image' ? fileData.b64 : undefined;
    const videoB64 = fileData?.type === 'video' ? fileData.b64 : undefined;
    
    onGenerate(prompt, imageB64, videoB64, {...paramValues,__policy:policy,__provider:provider,__sourceDuration:fileData?.duration});
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFileDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const b64 = await toBase64(file);
      const isVideo = file.type.startsWith('video/');
      const bgUrl = URL.createObjectURL(file);
      const duration = isVideo ? await readVideoDuration(bgUrl) : undefined;
      setFileData({
        type: isVideo ? 'video' : 'image',
        bgUrl,
        b64,
        duration,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const applySourceUrl = (type: 'image' | 'video', url: string) => {
    const isSupported = type === 'image' ? selectedModel.supportsImageUpload : selectedModel.supportsVideoUpload;
    if (!isSupported) return;
    setFileData({ type, bgUrl: url, b64: url });
    if (type === 'video') {
      void readVideoDuration(url).then((duration) => {
        if (duration === undefined) return;
        setFileData((current) => current?.type === 'video' && current.b64 === url ? { ...current, duration } : current);
      });
    }
  };

  const handleSourceDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const raw = e.dataTransfer.getData('application/x-kie-media');
    if (!raw) return;
    e.preventDefault();

    try {
      const asset = JSON.parse(raw) as { type?: 'image' | 'video'; url?: string };
      if (asset.type && asset.url) {
        applySourceUrl(asset.type, asset.url);
      }
    } catch (error) {
      console.warn('Invalid dropped source asset.', error);
    }
  };

  const acceptsDroppedAsset = (accept: string | undefined, type: 'image' | 'video') => {
    if (!accept || accept === '*/*') return true;
    if (type === 'image') return accept.includes('image/*');
    return accept.includes('video/*');
  };

  const valuesAsArray = (value: unknown) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  };

  const appendParamFiles = (param: ModelParamConfig, values: string[]) => {
    if (values.length === 0) return;
    setParamValues((current) => {
      if (!param.multiple) {
        return { ...current, [param.key]: values[0] };
      }

      const maxFiles = param.maxFiles ?? Number.POSITIVE_INFINITY;
      const existing = valuesAsArray(current[param.key]) as string[];
      return { ...current, [param.key]: [...existing, ...values].slice(0, maxFiles) };
    });
  };

  const removeParamFile = (param: ModelParamConfig, index: number) => {
    setParamValues((current) => {
      if (!param.multiple) return { ...current, [param.key]: '' };

      const next = valuesAsArray(current[param.key]).filter((_, itemIndex) => itemIndex !== index);
      return { ...current, [param.key]: next };
    });
  };

  const applyParamSourceDrop = (event: React.DragEvent<HTMLDivElement>, param: ModelParamConfig) => {
    const raw = event.dataTransfer.getData('application/x-kie-media');
    if (!raw) return;

    try {
      const asset = JSON.parse(raw) as { type?: 'image' | 'video'; url?: string };
      if (!asset.type || !asset.url || !acceptsDroppedAsset(param.accept, asset.type)) return;
      event.preventDefault();
      appendParamFiles(param, [asset.url]);
    } catch (error) {
      console.warn('Invalid dropped parameter source asset.', error);
    }
  };

  const getParamPreviewKind = (accept: string | undefined, value: unknown) => {
    if (typeof value !== 'string' || !value) return null;
    if (accept?.includes('video/*')) return 'video';
    if (accept?.includes('image/*')) return 'image';
    if (value.startsWith('data:image/') || /\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(value)) return 'image';
    if (value.startsWith('data:video/') || /\.(mp4|webm|mov)(?:$|\?)/i.test(value)) return 'video';
    return null;
  };

  const getVoiceValues = (param: ModelParamConfig) => {
    const value = paramValues[param.key];
    if (param.multiple) return valuesAsArray(value).map(String);
    return value ? [String(value)] : [];
  };

  const setVoiceValue = (param: ModelParamConfig, value: string) => {
    setParamValues((current) => {
      if (!param.multiple) {
        return { ...current, [param.key]: value };
      }

      const maxItems = param.maxItems ?? Number.POSITIVE_INFINITY;
      const currentValues = valuesAsArray(current[param.key]).map(String);
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value].slice(0, maxItems);
      return { ...current, [param.key]: nextValues };
    });
  };

  const selectedClip = editorClips.find((clip) => clip.id === selectedClipId) || editorClips[0] || null;
  const previewClip = isPreviewingTimeline ? editorClips[previewClipIndex] || selectedClip : selectedClip;
  const timelineDuration = editorClips.reduce((total, clip) => total + Math.max(0, clip.end - clip.start), 0);

  const getVideoDuration = (url: string) => {
    return new Promise<number>((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;
      video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 5);
      video.onerror = () => resolve(5);
    });
  };

  const addEditorClip = async (url: string, label = 'Generated clip') => {
    const duration = await getVideoDuration(url);
    const clip: EditorClip = {
      id: crypto.randomUUID(),
      url,
      label,
      duration,
      start: 0,
      end: Math.max(0.1, duration),
    };
    setEditorClips((current) => [...current, clip]);
    setSelectedClipId(clip.id);
    setWorkspaceMode('edit');
  };

  const handleEditorDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const raw = event.dataTransfer.getData('application/x-kie-media');
    if (!raw) return;
    event.preventDefault();

    try {
      const asset = JSON.parse(raw) as { type?: 'image' | 'video'; url?: string; label?: string };
      if (asset.type !== 'video' || !asset.url) return;
      addEditorClip(asset.url, asset.label || 'Generated clip');
    } catch (error) {
      console.warn('Invalid dropped editor asset.', error);
    }
  };

  const updateEditorClip = (clipId: string, patch: Partial<EditorClip>) => {
    setEditorClips((current) => current.map((clip) => {
      if (clip.id !== clipId) return clip;
      const next = { ...clip, ...patch };
      const safeStart = Math.max(0, Math.min(next.start, next.duration - 0.1));
      const safeEnd = Math.max(safeStart + 0.1, Math.min(next.end, next.duration));
      return { ...next, start: safeStart, end: safeEnd };
    }));
  };

  const moveEditorClip = (clipId: string, direction: -1 | 1) => {
    setEditorClips((current) => {
      const index = current.findIndex((clip) => clip.id === clipId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [clip] = next.splice(index, 1);
      next.splice(nextIndex, 0, clip);
      return next;
    });
  };

  const removeEditorClip = (clipId: string) => {
    setEditorClips((current) => {
      const next = current.filter((clip) => clip.id !== clipId);
      if (selectedClipId === clipId) {
        setSelectedClipId(next[0]?.id || '');
      }
      return next;
    });
  };

  const splitSelectedClip = () => {
    if (!selectedClip || selectedClip.end - selectedClip.start < 0.4) return;
    const midpoint = selectedClip.start + (selectedClip.end - selectedClip.start) / 2;
    const left: EditorClip = { ...selectedClip, id: crypto.randomUUID(), end: midpoint };
    const right: EditorClip = { ...selectedClip, id: crypto.randomUUID(), start: midpoint };
    setEditorClips((current) => current.flatMap((clip) => clip.id === selectedClip.id ? [left, right] : [clip]));
    setSelectedClipId(right.id);
  };

  const loadVideoForPlayback = (clip: EditorClip) => {
    const video = previewVideoRef.current;
    if (!video) return;
    video.src = clip.url;
    video.currentTime = clip.start;
    video.play().catch((error) => console.warn('Unable to play timeline preview.', error));
  };

  const startTimelinePreview = () => {
    if (editorClips.length === 0) return;
    setPreviewClipIndex(0);
    setIsPreviewingTimeline(true);
    loadVideoForPlayback(editorClips[0]);
  };

  const stopTimelinePreview = () => {
    setIsPreviewingTimeline(false);
    previewVideoRef.current?.pause();
  };

  const handleTimelineTimeUpdate = () => {
    const video = previewVideoRef.current;
    const clip = editorClips[previewClipIndex];
    if (!video || !clip || video.currentTime < clip.end) return;
    const nextIndex = previewClipIndex + 1;
    if (nextIndex >= editorClips.length) {
      stopTimelinePreview();
      return;
    }
    setPreviewClipIndex(nextIndex);
    loadVideoForPlayback(editorClips[nextIndex]);
  };

  const exportTimeline = async () => {
    if (editorClips.length === 0 || !exportCanvasRef.current) return;
    setExportStatus('Preparing export...');

    const canvas = exportCanvasRef.current;
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const drawClip = (clip: EditorClip) => new Promise<void>((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.src = clip.url;

      const finish = () => {
        video.pause();
        resolve();
      };

      video.onloadedmetadata = async () => {
        try {
          video.currentTime = clip.start;
          await new Promise<void>((seekResolve) => {
            video.onseeked = () => seekResolve();
          });
          await video.play();
          const paint = () => {
            if (video.currentTime >= clip.end || video.ended) {
              finish();
              return;
            }
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const ratio = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
            const width = video.videoWidth * ratio;
            const height = video.videoHeight * ratio;
            ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
            requestAnimationFrame(paint);
          };
          paint();
        } catch (error) {
          reject(error);
        }
      };
      video.onerror = () => reject(new Error('Unable to load a timeline clip for export.'));
    });

    try {
      recorder.start();
      for (let index = 0; index < editorClips.length; index += 1) {
        setExportStatus(`Exporting clip ${index + 1}/${editorClips.length}...`);
        await drawClip(editorClips[index]);
      }
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `timeline-export-${Date.now()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
      setExportStatus('Export complete.');
    } catch (error) {
      console.error(error);
      setExportStatus('Export failed. Try using local generated clips only.');
      if (recorder.state !== 'inactive') recorder.stop();
    }
  };

  const downloadMedia = (url: string, filename: string) => {
    // Determine a basic extension from typical URLs or default to .mp4/.png
    let ext = '';
    if (url.includes('.mp4')) ext = '.mp4';
    else if (url.includes('.webm')) ext = '.webm';
    else if (url.includes('.png')) ext = '.png';
    else if (url.includes('.jpg')) ext = '.jpg';
    else if (url.includes('.jpeg')) ext = '.jpeg';
    else if (url.includes('.webp')) ext = '.webp';
    else if (latestLog?.type === 'video') ext = '.mp4';
    else ext = '.png';

    const fullFilename = filename.includes('.') ? filename : `${filename}${ext}`;
    
    // Redirect through our backend proxy to trigger a clean download and bypass CORS
    const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fullFilename)}`;
    window.location.href = proxyUrl;
  };

  const isActiveLogGenerating = latestLog?.status === 'generating';
  const showFileOutput = !isActiveLogGenerating && latestLog?.status === 'success' && latestLog.mediaUrl;
  const showTextOutput = !isActiveLogGenerating && latestLog?.status === 'success' && latestLog.textResult;
  useEffect(()=>{const refresh=()=>{jsonRequest('/api/providers').then(config=>{setPolicy(config.policy);setProvider(config.priority[0]);setProviderRevision(value=>value+1);}).catch(()=>{});};refresh();window.addEventListener('studio-providers-changed',refresh);return()=>window.removeEventListener('studio-providers-changed',refresh);},[]);
  useEffect(()=>{const choices=resolveModel(selectedModel).mappings;if(!choices.some(p=>p.provider===provider) && choices[0])setProvider(choices[0].provider);},[selectedModel,provider]);
  useEffect(()=>{if(remix){setPrompt(remix.prompt);setParamValues(current=>({...current,...remix.settings}));}},[remix]);
  useEffect(()=>{
    let canceled=false;setEstimate(null);
    const timer=window.setTimeout(()=>{jsonRequest('/api/generation/estimate',{logicalModel:resolveModel(selectedModel).logicalId,input:paramValues,policy,provider,sourceType:fileData?.type,sourceDuration:fileData?.duration})
      .then(value=>{if(!canceled){setEstimate(value);setEstimateError('');}}).catch(error=>{if(!canceled){setEstimate(null);setEstimateError(error.message);}});},200);
    return ()=>{canceled=true;clearTimeout(timer);};
  },[selectedModel,paramValues,policy,provider,fileData?.type,fileData?.duration,providerRevision]);
  const estimatedCredits = estimate?.cost.credits;
  const estimatedUsd = estimate?.cost.usd == null ? null : Number(estimate.cost.usd).toFixed(4);
  const canSubmit = Boolean(estimate && (prompt.trim() || fileData || selectedModel.allowsPromptlessGeneration));
  const inputJson = JSON.stringify({ prompt, ...previewJsonValue(paramValues) }, null, 2);
  
  const renderOutput = () => {
    if (isActiveLogGenerating) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-indigo-400">
          <Loader2 className="w-10 h-10 animate-spin mb-4" />
          <p className="font-medium">{latestLog?.normalizedStatus==='queued'?'Queued — waiting for an available slot':'Creating your media…'}</p>
          <p className="text-xs text-neutral-500 mt-2">Using {latestLog?.modelName}</p>
        </div>
      );
    }
    
    if (showFileOutput) {
      const urls = latestLog.mediaUrls && latestLog.mediaUrls.length > 0 ? latestLog.mediaUrls : [latestLog.mediaUrl!];
      
      return (
        <div className="relative w-full h-full overflow-y-auto custom-scrollbar p-8">
          <div className={`grid gap-6 items-center justify-center min-h-full ${urls.length > 1 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {urls.map((url, idx) => (
              <div key={idx} className="relative group/item flex flex-col items-center justify-center">
                {latestLog.type === 'video' ? (
                  <video 
                    src={url} 
                    className="max-w-full max-h-[70vh] rounded-lg shadow-2xl ring-1 ring-white/10 object-contain"
                    controls 
                    autoPlay={autoplayVideos}
                    loop 
                  />
                ) : (
                  <img 
                    src={url} 
                    alt="Generated Result" 
                    className="max-w-full max-h-[70vh] rounded-lg shadow-2xl ring-1 ring-white/10 object-contain"
                  />
                )}
                
                <div className="absolute top-4 right-4 flex gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover/item:opacity-100 group-focus-within/item:opacity-100">
                  {onRevealFile && isLocalLibraryUrl(url) && (
                    <button
                      type="button"
                      onClick={() => onRevealFile(url)}
                      className="flex items-center gap-2 rounded-full border border-white/10 bg-neutral-900/90 p-3 text-white shadow backdrop-blur transition-colors hover:bg-neutral-800"
                      title="Reveal file in Finder"
                      aria-label="Reveal file in Finder"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadMedia(url, `generated-${latestLog.type}-${Date.now()}-${idx}`)}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-neutral-900/90 p-3 text-white shadow backdrop-blur transition-colors hover:bg-neutral-800"
                    title="Download"
                    aria-label="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (showTextOutput) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="w-full max-w-2xl rounded-lg border border-neutral-800 bg-neutral-950/80 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-neutral-200">Generated result</p>
              <button
                onClick={() => navigator.clipboard?.writeText(latestLog.textResult || '')}
                className="flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-neutral-900 p-4 font-mono text-sm text-neutral-100">
              {latestLog.textResult}
            </pre>
          </div>
        </div>
      );
    }

    if (latestLog?.status === 'failed') {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertCircle className="h-10 w-10 text-amber-400" />
          <p className="font-medium text-neutral-200">{latestLog.normalizedStatus === 'stalled' ? 'Generation stalled' : latestLog.normalizedStatus === 'canceled' ? 'Tracking stopped' : 'Generation failed'}</p>
          <p className="max-w-md text-sm text-neutral-500">{latestLog.error || 'The provider did not return a result.'}</p>
          {latestLog.pollingState === 'timed-out' && <button onClick={onOpenActivityPane} className="rounded-lg bg-violet-500/15 px-4 py-2 text-sm text-violet-200 hover:bg-violet-500/25">Open Activity to check or stop</button>}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400 space-y-4 p-4 text-center">
        <Sparkles className="w-12 h-12 text-violet-400/60" />
        <p className="text-sm tracking-wide">Ready to create</p><p className="text-xs text-neutral-500">Start with a prompt. Your results stay in this workspace.</p>
      </div>
    );
  };

  const renderVideoEditor = () => (
    <div
      className="flex h-full w-full flex-col bg-neutral-950"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('application/x-kie-media')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleEditorDrop}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex min-w-0 flex-col">
          <div className="flex-1 min-h-0 p-6">
            <div className="relative flex h-full items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-black">
              {editorClips.length > 0 ? (
                <video
                  ref={previewVideoRef}
                  className="h-full w-full object-contain"
                  controls={!isPreviewingTimeline}
                  muted
                  playsInline
                  onTimeUpdate={handleTimelineTimeUpdate}
                  src={previewClip?.url}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-neutral-500">
                  <Film className="h-12 w-12 text-neutral-700" />
                  <p className="text-sm">Drop generated videos here to build a timeline.</p>
                </div>
              )}
              <canvas ref={exportCanvasRef} className="hidden" />
            </div>
          </div>

          <div className="border-t border-neutral-800 bg-neutral-900/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-neutral-200">Timeline</p>
                <p className="text-xs text-neutral-500">{editorClips.length} clips · {formatSeconds(timelineDuration)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={isPreviewingTimeline ? stopTimelinePreview : startTimelinePreview}
                  disabled={editorClips.length === 0}
                  className="flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                >
                  {isPreviewingTimeline ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPreviewingTimeline ? 'Pause' : 'Play'}
                </button>
                <button
                  onClick={exportTimeline}
                  disabled={editorClips.length === 0}
                  className="flex h-9 items-center gap-2 rounded-md bg-indigo-500 px-3 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>

            <div className="flex min-h-28 gap-3 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 custom-scrollbar">
              {editorClips.length === 0 ? (
                <div className="grid min-w-full place-items-center rounded-md border border-dashed border-neutral-800 text-sm text-neutral-600">
                  Drag clips from Activity Log
                </div>
              ) : editorClips.map((clip, index) => {
                const selected = clip.id === selectedClip?.id;
                const width = Math.max(110, (clip.end - clip.start) * 34);
                return (
                  <button
                    key={clip.id}
                    onClick={() => {
                      setSelectedClipId(clip.id);
                      setPreviewClipIndex(index);
                      if (previewVideoRef.current) {
                        previewVideoRef.current.src = clip.url;
                        previewVideoRef.current.currentTime = clip.start;
                      }
                    }}
                    className={cn(
                      "relative h-24 shrink-0 overflow-hidden rounded-md border bg-neutral-900 text-left transition-colors",
                      selected ? "border-indigo-400 ring-2 ring-indigo-500/30" : "border-neutral-800 hover:border-neutral-600"
                    )}
                    style={{ width }}
                  >
                    <video src={clip.url} className="h-full w-full object-cover opacity-70" muted playsInline />
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2">
                      <p className="truncate text-xs font-medium text-white">{index + 1}. {clip.label}</p>
                      <p className="text-[11px] text-neutral-400">{formatSeconds(clip.end - clip.start)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {exportStatus && <p className="mt-2 text-xs text-neutral-500">{exportStatus}</p>}
          </div>
        </div>

        <div className="border-l border-neutral-800 bg-neutral-900/50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Clip Controls</h3>
          {selectedClip ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="truncate text-sm font-medium text-neutral-100">{selectedClip.label}</p>
                <p className="mt-1 text-xs text-neutral-500">Source length {formatSeconds(selectedClip.duration)}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Trim Start</label>
                <input
                  type="range"
                  min={0}
                  max={selectedClip.duration}
                  step={0.1}
                  value={selectedClip.start}
                  onChange={(event) => {
                    const nextStart = Number(event.target.value);
                    updateEditorClip(selectedClip.id, { start: nextStart });
                    if (previewVideoRef.current) previewVideoRef.current.currentTime = nextStart;
                  }}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>{formatSeconds(selectedClip.start)}</span>
                  <span>{formatSeconds(selectedClip.end)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Trim End</label>
                <input
                  type="range"
                  min={0}
                  max={selectedClip.duration}
                  step={0.1}
                  value={selectedClip.end}
                  onChange={(event) => updateEditorClip(selectedClip.id, { end: Number(event.target.value) })}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => moveEditorClip(selectedClip.id, -1)}
                  className="flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  <StepBack className="h-4 w-4" />
                  Earlier
                </button>
                <button
                  onClick={() => moveEditorClip(selectedClip.id, 1)}
                  className="flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  <StepForward className="h-4 w-4" />
                  Later
                </button>
                <button
                  onClick={splitSelectedClip}
                  className="flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-800 text-sm text-neutral-300 hover:bg-neutral-800"
                >
                  <Scissors className="h-4 w-4" />
                  Split
                </button>
                <button
                  onClick={() => removeEditorClip(selectedClip.id)}
                  className="flex h-9 items-center justify-center gap-2 rounded-md border border-red-500/30 text-sm text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-lg border border-dashed border-neutral-800 p-5 text-center text-sm text-neutral-500">
              Select a clip to trim or cut.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 to-neutral-950">
      
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between flex-wrap gap-3 border-b border-neutral-800/50 px-4 py-3 sm:px-6 sm:py-4 z-10">
        <div className="flex min-w-0 items-start gap-2">
          {(
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onOpenModelPane}
                className="grid h-8 w-8 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-100"
                title="Open model pane"
                aria-label="Open model pane"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenActivityPane}
                className="grid h-8 w-8 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-100"
                title="Open activity pane"
                aria-label="Open activity pane"
              >
                <PanelRightOpen className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="min-w-0">
          <h2 className="mb-1 max-w-[48vw] text-base sm:text-xl font-semibold tracking-tight text-neutral-100 sm:max-w-none sm:text-2xl">
            {workspaceMode === 'edit' ? (USE_CLYPRA_EDITOR ? 'Clypra Editor' : 'Video Editor') : selectedModel.name}
          </h2>
          <p className="hidden text-neutral-400 font-mono text-xs sm:block">
            {workspaceMode === 'edit'
              ? USE_CLYPRA_EDITOR
                ? 'Experimental Clypra adapter mount'
                : 'Assemble, trim, split, and export generated clips'
              : `Powered by ${selectedModel.provider} • ${selectedModel.category.replace(/-/g, ' ')}`}
          </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latestLog && <button onClick={onStartNew} className="rounded-lg border border-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800">New creation</button>}
          {latestLog?.mediaUrl && <button onClick={onInspect} className="text-sm text-violet-300 px-2">Inspect result</button>}
          {workspaceMode === 'create' && selectedModel.params && selectedModel.params.length > 0 && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors border",
                showSettings
                  ? "bg-neutral-800 text-neutral-100 border-neutral-700"
                  : "bg-transparent text-neutral-400 border-transparent hover:bg-neutral-800/50 hover:text-neutral-200"
              )}
            >
              <Settings2 className="w-4 h-4" />
              Parameters
            </button>
          )}
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
            <button
              type="button"
              onClick={() => setWorkspaceMode('create')}
              className={cn(
                "rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
                workspaceMode === 'create' ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-200"
              )}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode('edit')}
              className={cn(
                "rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
                workspaceMode === 'edit' ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-200"
              )}
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex min-h-0 w-full flex-1 overflow-hidden relative">
        
        {workspaceMode === 'edit' ? (
          USE_CLYPRA_EDITOR ? <ClypraEditorHost /> : renderVideoEditor()
        ) : (
          <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={isActiveLogGenerating ? 'generating' : (showFileOutput ? 'output' : 'empty')}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 w-full h-full backdrop-blur-3xl"
              >
                {renderOutput()}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
        
        {/* Settings Panel (collapsible from right) */}
        <AnimatePresence>
          {workspaceMode === 'create' && showSettings && selectedModel.params && (
            <>
              {(
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="absolute inset-0 z-10 bg-black/50"
                  aria-label="Close model parameters"
                />
              )}
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: isCompactLayout ? 'min(88vw, 360px)' : 300, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className={cn(
                  'flex h-full min-h-0 flex-col overflow-hidden border-l border-neutral-800/80 bg-neutral-900/90 backdrop-blur',
                  'absolute inset-y-0 right-0 z-30 shadow-2xl'
                )}
              >
              <div
                className={cn('flex h-full min-h-0 flex-col p-4', isCompactLayout ? 'w-full' : 'w-[300px]')}
              >
                <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
                  <button onClick={()=>setShowSettings(false)} aria-label="Close parameters" className="text-xs text-neutral-400">✕ Parameters</button>
                  <div className="grid grid-cols-2 gap-1 rounded-md border border-neutral-800 bg-neutral-950 p-1">
                    <button
                      type="button"
                      onClick={() => setSettingsView('form')}
                      className={cn(
                        'rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                        settingsView === 'form' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-500 hover:text-neutral-200'
                      )}
                    >
                      Form
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsView('json')}
                      className={cn(
                        'rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                        settingsView === 'json' ? 'bg-indigo-500 text-white' : 'text-neutral-500 hover:text-neutral-200'
                      )}
                    >
                      JSON
                    </button>
                  </div>
                </div>
                {settingsView === 'json' ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex shrink-0 items-center justify-between gap-2">
                      <span className="text-xs text-neutral-500">Current input</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(inputJson)}
                        className="flex items-center gap-1.5 rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                    <pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-[11px] leading-relaxed text-neutral-300 custom-scrollbar">
                      {inputJson}
                    </pre>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 custom-scrollbar">
                {selectedModel.params.map((param) => (
                  <div key={param.key} className="space-y-2">
                    <label className="text-sm font-medium text-neutral-300 block">
                      {param.name}
                    </label>
                    {param.description && (
                      <p className="text-xs leading-relaxed text-neutral-500">
                        {param.description}
                      </p>
                    )}
                    {param.type === 'select' && param.options && (
                      <select
                        value={paramValues[param.key] || ''}
                        onChange={(e) => setParamValues({...paramValues, [param.key]: e.target.value})}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-sm text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                      >
                        {param.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                    {param.type === 'voice-select' && param.options && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenVoiceParamKey(openVoiceParamKey === param.key ? null : param.key);
                            setVoiceSearch('');
                          }}
                          className="flex w-full items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-2 text-left text-sm text-neutral-200 transition-colors hover:border-neutral-700 focus:outline-none focus:border-indigo-500"
                        >
                          <span className="truncate">
                            {getVoiceValues(param).length > 0
                              ? getVoiceValues(param).map((value) => param.options?.find((option) => String(option.value) === value)?.label || value).join(', ')
                              : 'Select voice'}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {param.multiple ? `${getVoiceValues(param).length}/${param.maxItems || param.options.length}` : ''}
                          </span>
                        </button>

                        {openVoiceParamKey === param.key && (
                          <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl">
                            <div className="border-b border-neutral-800 p-2">
                              <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5">
                                <Search className="h-3.5 w-3.5 text-neutral-500" />
                                <input
                                  value={voiceSearch}
                                  onChange={(event) => setVoiceSearch(event.target.value)}
                                  placeholder="Search voices..."
                                  className="w-full bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
                                />
                              </div>
                            </div>
                            <div className="max-h-72 overflow-y-auto p-1">
                              {param.options
                                .filter((option) => {
                                  const haystack = `${option.label} ${option.value} ${option.description || ''} ${option.group || ''}`.toLowerCase();
                                  return haystack.includes(voiceSearch.trim().toLowerCase());
                                })
                                .map((option) => {
                                  const value = String(option.value);
                                  const selected = getVoiceValues(param).includes(value);
                                  return (
                                    <div
                                      key={value}
                                      className={cn(
                                        "flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                                        selected ? "bg-indigo-500/10 text-indigo-200" : "text-neutral-300 hover:bg-neutral-800"
                                      )}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setVoiceValue(param, value)}
                                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                      >
                                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-800 text-xs text-neutral-400">
                                          {option.label.slice(0, 1)}
                                        </span>
                                        <span className="min-w-0">
                                          <span className="block truncate text-sm font-medium">{option.label}</span>
                                          <span className="block truncate text-xs text-neutral-500">{option.description}</span>
                                        </span>
                                      </button>
                                      {selected && <Check className="h-4 w-4 shrink-0 text-indigo-300" />}
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {param.type === 'number' && (
                      <input
                        type="number"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={paramValues[param.key] ?? ''}
                        onChange={(e) => setParamValues({...paramValues, [param.key]: parseFloat(e.target.value)})}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-sm text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    )}
                    {param.type === 'text' && (
                      <textarea
                        value={paramValues[param.key] || ''}
                        onChange={(e) => setParamValues({...paramValues, [param.key]: e.target.value})}
                        className="w-full h-20 resize-none bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-sm text-neutral-200 focus:outline-none focus:border-indigo-500 transition-colors"
                        placeholder="Optional"
                      />
                    )}
                    {param.type === 'slider' && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-neutral-400">
                          <span>{param.min}</span>
                          <span>{paramValues[param.key]}</span>
                          <span>{param.max}</span>
                        </div>
                        <input
                          type="range"
                          min={param.min}
                          max={param.max}
                          step={param.step}
                          value={paramValues[param.key] ?? param.defaultValue}
                          onChange={(e) => setParamValues({...paramValues, [param.key]: parseFloat(e.target.value)})}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                    )}
                    {param.type === 'boolean' && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paramValues[param.key] ?? false}
                          onChange={(e) => setParamValues({...paramValues, [param.key]: e.target.checked})}
                          className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-neutral-300">Enable</span>
                      </label>
                    )}
                    {param.type === 'file' && (
                      <div
                        className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950/50 p-2 transition-colors hover:border-neutral-700"
                        onDragOver={(event) => {
                          if (!event.dataTransfer.types.includes('application/x-kie-media')) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'copy';
                        }}
                        onDrop={(event) => applyParamSourceDrop(event, param)}
                      >
                        {valuesAsArray(paramValues[param.key]).length > 0 && (
                          <div className={cn(
                            "mb-2 grid gap-2",
                            param.multiple ? "grid-cols-2" : "grid-cols-1"
                          )}>
                            {valuesAsArray(paramValues[param.key]).map((value, index) => (
                              <div key={`${String(value)}-${index}`} className="group relative overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
                                {getParamPreviewKind(param.accept, value) === 'video' ? (
                                  <video
                                    src={String(value)}
                                    className="h-16 w-full object-cover"
                                    muted
                                    loop
                                    playsInline
                                  />
                                ) : getParamPreviewKind(param.accept, value) === 'image' ? (
                                  <img
                                    src={String(value)}
                                    alt={`${param.name} preview ${index + 1}`}
                                    className="h-16 w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-16 items-center px-3 text-xs text-neutral-400">
                                    {String(value).split('/').pop() || 'Attached file'}
                                  </div>
                                )}
                                <button
                                  className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
                                  onClick={() => removeParamFile(param, index)}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm border border-neutral-700 transition"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = param.accept || '*/*';
                            input.multiple = Boolean(param.multiple);
                            input.onchange = async (e: any) => {
                              const files = Array.from(e.target.files || []) as File[];
                              const encodedFiles = await Promise.all(files.map(toBase64));
                              appendParamFiles(param, encodedFiles);
                            };
                            input.click();
                          }}
                        >
                          {param.multiple ? 'Select Files' : 'Select File'}
                        </button>
                        {valuesAsArray(paramValues[param.key]).length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-green-400 truncate w-20">
                              {param.multiple ? `${valuesAsArray(paramValues[param.key]).length} loaded` : 'Loaded'}
                            </span>
                            <button className="text-neutral-500 hover:text-red-400" onClick={() => setParamValues({...paramValues, [param.key]: param.multiple ? [] : ''})}>&times;</button>
                          </div>
                        )}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-500">
                          <Link2 className="h-3 w-3" />
                          <span>Drop matching media from Activity Log here</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                  </div>
                )}
              </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>

      {/* 3. Input Controls Base (Fixed at bottom) */}
      {workspaceMode === 'create' && <div className="relative z-20 w-full shrink-0 max-h-[60vh] overflow-y-auto px-3 sm:px-4 pb-4 pt-0">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 rounded-2xl border border-neutral-800/80 bg-neutral-900/90 p-3 shadow-2xl backdrop-blur-xl">
          
          <div className="flex flex-wrap items-center gap-3"><label className="text-xs text-neutral-400">Workflow <select aria-label="Generation workflow" value={workflow} onChange={e=>onWorkflowChange(e.target.value as Workflow)} className="ml-2 rounded-lg border border-violet-500/30 bg-neutral-950 px-3 py-2 text-violet-200">{WORKFLOWS.filter(w=>w.id!=='all'&&(w.modality==='all'||w.modality===(selectedModel.category.includes('video')?'video':'image'))).map(w=><option key={w.id} value={w.id}>{w.label}</option>)}</select></label><span className="text-xs text-neutral-500">{WORKFLOWS.find(w=>w.id===workflow)?.hint}</span></div>
          {!['text-to-video','text-to-image'].includes(workflow) && (selectedModel.params||[]).filter(p=>p.type==='file'&&p.accept?.includes('image')&&(/reference|first_frame|last_frame|start_frame|end_frame/.test(p.key))).length>0 && <div className="flex gap-3 overflow-x-auto py-1">{(selectedModel.params||[]).filter(p=>p.type==='file'&&p.accept?.includes('image')&&(/reference|first_frame|last_frame|start_frame|end_frame/.test(p.key))).map(param=><div key={param.key} className="shrink-0 rounded-lg border border-neutral-700 p-2 min-w-32"><label className="text-xs text-neutral-300 block">{param.name}<input aria-label={`Upload ${param.name}`} className="block max-w-48 mt-2 text-[10px]" type="file" accept={param.accept} multiple={param.multiple} onChange={async e=>{const files=Array.from(e.target.files||[]);appendParamFiles(param,await Promise.all(files.map(toBase64)));e.target.value='';}}/></label><div className="flex gap-1 mt-2">{valuesAsArray(paramValues[param.key]).map((url,index)=><button key={index} onClick={()=>removeParamFile(param,index)} aria-label={`Remove ${param.name} ${index+1}`} title="Remove image"><img src={String(url)} alt={param.name} className="w-14 h-12 object-cover rounded"/></button>)}</div></div>)}</div>}
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-end">
            {!['text-to-video','text-to-image'].includes(workflow) && (selectedModel.supportsImageUpload || selectedModel.supportsVideoUpload) && !firstImageParameter(selectedModel,workflow) && (
              <div
                className="flex shrink-0 flex-wrap gap-2 rounded-xl"
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-kie-media')) {
                    e.preventDefault();
                  }
                }}
                onDrop={handleSourceDrop}
              >
                {fileData && (
                  <div className="relative group h-16 w-20 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800">
                    {fileData.type === 'video' ? (
                       <video src={fileData.bgUrl} className="w-full h-full object-cover" />
                    ) : (
                       <img src={fileData.bgUrl} alt="Upload" className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={() => setFileData(null)}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold text-white"
                    >
                      Remove
                    </button>
                  </div>
                )}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-700 text-neutral-400 transition-all hover:border-neutral-500 hover:bg-neutral-800"
                >
                  <Upload className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                  <span className="text-xs font-medium text-center leading-tight">{workflow==='image-to-video'?'Add starting image':workflow==='reference'?'Add reference':selectedModel.supportsVideoUpload&&!selectedModel.supportsImageUpload?'Add video':'Add image'}</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept={uploadAccept}
                  onChange={handleFileDrop}
                />
              </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="w-full flex-1 min-h-[60px] relative rounded-xl border border-neutral-700/50 bg-neutral-950 flex focus-within:ring-2 ring-indigo-500/50 focus-within:border-indigo-500/50 transition-all">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={`Describe what you want to create with ${selectedModel.name}...`}
                className="w-full min-h-[60px] max-h-48 resize-none bg-transparent p-4 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleGenerate();
                  }
                }}
              />
            </div>
            
            <button
              onClick={handleGenerate}
              disabled={isSubmitting || !canSubmit}
              className={cn(
                "flex h-12 sm:h-14 shrink-0 justify-center items-center gap-2 rounded-xl px-4 sm:px-6 font-medium shadow-lg transition-all",
                isSubmitting
                  ? "bg-indigo-500/50 text-white cursor-not-allowed" 
                  : "bg-indigo-500 hover:bg-indigo-400 text-white"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {estimatedCredits ? `${estimatedCredits} cr ` : ''}
                  Generate
                </>
              )}
            </button>
            </div>
          </div>
          <ComposerControls model={selectedModel} values={paramValues} onChange={(key,value)=>setParamValues(current=>({...current,[key]:value}))} onModels={()=>onOpenModelPane?.()} onMore={()=>setShowSettings(true)} policy={policy} onPolicy={setPolicy} provider={provider} onProvider={setProvider}/>
          {estimate && estimatedUsd !== null ? (
            <div className="flex items-center justify-end gap-2 text-xs text-neutral-400">
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Estimated · {estimate.provider}: <span className="font-semibold text-neutral-200">${estimatedUsd}{estimatedCredits != null ? ` · ${estimatedCredits} credits` : ''}</span>
                <span> · Final cost reported separately</span>
                {fileData?.type === 'video' && fileData.duration && selectedModel.creditEstimator?.billsSourceVideoDuration && (
                  <span> (includes {formatSeconds(fileData.duration)} source)</span>
                )}
              </span>
              {selectedModel.creditEstimator?.label && (
                <span className="text-neutral-600">({selectedModel.creditEstimator.label})</span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 text-xs text-amber-400/80">
              <Wallet className="w-3.5 h-3.5" />
              <span>{estimateError || estimate?.cost.source || 'Checking estimated cost…'}</span>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}
