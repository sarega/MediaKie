import React, { useState, useRef, useEffect } from 'react';
import { AIModel, GenerationLog, estimateModelCredits } from '../types';
import { Sparkles, Upload, Download, Loader2, Settings2, Wallet, Link2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  selectedModel: AIModel;
  onGenerate: (prompt: string, imageBase64?: string, videoBase64?: string, params?: Record<string, any>) => void;
  isGenerating: boolean;
  latestLog?: GenerationLog;
  sourceAsset?: { id: string; type: 'image' | 'video'; url: string; label?: string } | null;
}

export function MediaWorkspace({ selectedModel, onGenerate, isGenerating, latestLog, sourceAsset }: Props) {
  const [prompt, setPrompt] = useState('');
  
  // Base64 files
  const [fileData, setFileData] = useState<{ type: 'image' | 'video', bgUrl: string, b64: string } | null>(null);
  
  // Custom Parameters
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [showSettings, setShowSettings] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAccept = selectedModel.supportsImageUpload && selectedModel.supportsVideoUpload
    ? 'image/*,video/*'
    : selectedModel.supportsVideoUpload
      ? 'video/*'
      : 'image/*';

  useEffect(() => {
    // Reset or initialize params when model changes
    const initialParams: Record<string, any> = {};
    if (selectedModel.params) {
      selectedModel.params.forEach(p => {
        initialParams[p.key] = p.defaultValue;
      });
    }
    setParamValues(initialParams);
  }, [selectedModel]);

  useEffect(() => {
    if (!sourceAsset) return;
    const isSupported = sourceAsset.type === 'image'
      ? selectedModel.supportsImageUpload
      : selectedModel.supportsVideoUpload;
    if (!isSupported) return;

    setFileData({
      type: sourceAsset.type,
      bgUrl: sourceAsset.url,
      b64: sourceAsset.url,
    });
  }, [sourceAsset, selectedModel]);

  const handleGenerate = () => {
    if (!prompt.trim() && !fileData && !selectedModel.allowsPromptlessGeneration) return;
    
    const imageB64 = fileData?.type === 'image' ? fileData.b64 : undefined;
    const videoB64 = fileData?.type === 'video' ? fileData.b64 : undefined;
    
    onGenerate(prompt, imageB64, videoB64, paramValues);
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
      setFileData({
        type: isVideo ? 'video' : 'image',
        bgUrl,
        b64
      });
    } catch (e) {
      console.error(e);
    }
  };

  const applySourceUrl = (type: 'image' | 'video', url: string) => {
    const isSupported = type === 'image' ? selectedModel.supportsImageUpload : selectedModel.supportsVideoUpload;
    if (!isSupported) return;
    setFileData({ type, bgUrl: url, b64: url });
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

  const applyParamSourceDrop = (event: React.DragEvent<HTMLDivElement>, paramKey: string, accept?: string) => {
    const raw = event.dataTransfer.getData('application/x-kie-media');
    if (!raw) return;

    try {
      const asset = JSON.parse(raw) as { type?: 'image' | 'video'; url?: string };
      if (!asset.type || !asset.url || !acceptsDroppedAsset(accept, asset.type)) return;
      event.preventDefault();
      setParamValues((current) => ({ ...current, [paramKey]: asset.url }));
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

  const showFileOutput = !isGenerating && latestLog?.status === 'success' && latestLog.mediaUrl;
  const estimatedCredits = estimateModelCredits(selectedModel, paramValues, fileData?.type);
  const canSubmit = Boolean(prompt.trim() || fileData || selectedModel.allowsPromptlessGeneration);
  
  const renderOutput = () => {
    if (isGenerating) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-indigo-400">
          <Loader2 className="w-10 h-10 animate-spin mb-4" />
          <p className="font-medium">Generating your masterpiece...</p>
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
                    autoPlay 
                    loop 
                  />
                ) : (
                  <img 
                    src={url} 
                    alt="Generated Result" 
                    className="max-w-full max-h-[70vh] rounded-lg shadow-2xl ring-1 ring-white/10 object-contain"
                  />
                )}
                
                <div className="absolute top-4 right-4 opacity-0 group-hover/item:opacity-100 transition-opacity">
                  <button
                    onClick={() => downloadMedia(url, `generated-${latestLog.type}-${Date.now()}-${idx}`)}
                    className="flex items-center gap-2 bg-neutral-900/90 hover:bg-neutral-800 text-white p-3 rounded-full backdrop-blur shadow border border-white/10 transition-colors"
                    title="Download"
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

    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-600 space-y-4">
        <Sparkles className="w-16 h-16 opacity-20" />
        <p className="text-sm uppercase tracking-widest opacity-60">Ready to create</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 to-neutral-950">
      
      {/* Header */}
      <div className="px-8 py-6 border-b border-neutral-800/50 flex justify-between items-center z-10 shrink-0">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white mb-1">
            {selectedModel.name}
          </h2>
          <p className="text-neutral-400 font-mono text-xs">
            Powered by {selectedModel.provider} • {selectedModel.category.replace(/-/g, ' ')}
          </p>
        </div>
        {selectedModel.params && selectedModel.params.length > 0 && (
           <button
             onClick={() => setShowSettings(!showSettings)}
             className={cn(
               "flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors border",
               showSettings 
                 ? "bg-neutral-800 text-white border-neutral-700" 
                 : "bg-transparent text-neutral-400 border-transparent hover:bg-neutral-800/50 hover:text-neutral-200"
             )}
           >
             <Settings2 className="w-4 h-4" />
             Parameters
           </button>
        )}
      </div>

      {/* Main Area */}
      <div className="flex-1 w-full relative flex overflow-hidden">
        
        {/* Output */}
        <div className="flex-1 w-full relative overflow-hidden flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={isGenerating ? 'generating' : (showFileOutput ? 'output' : 'empty')}
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
        
        {/* Settings Panel (collapsible from right) */}
        <AnimatePresence>
          {showSettings && selectedModel.params && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-neutral-800/80 bg-neutral-900/60 backdrop-blur shrink-0 overflow-y-auto"
            >
              <div className="p-5 space-y-6 w-[280px]">
                <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-400">Model Parameters</h3>
                {selectedModel.params.map((param) => (
                  <div key={param.key} className="space-y-2">
                    <label className="text-sm font-medium text-neutral-300 block">
                      {param.name}
                    </label>
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
                        onDrop={(event) => applyParamSourceDrop(event, param.key, param.accept)}
                      >
                        {paramValues[param.key] && (
                          <div className="mb-2 overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
                            {getParamPreviewKind(param.accept, paramValues[param.key]) === 'video' ? (
                              <video
                                src={paramValues[param.key]}
                                className="h-24 w-full object-cover"
                                muted
                                loop
                                playsInline
                              />
                            ) : getParamPreviewKind(param.accept, paramValues[param.key]) === 'image' ? (
                              <img
                                src={paramValues[param.key]}
                                alt={`${param.name} preview`}
                                className="h-24 w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-16 items-center px-3 text-xs text-neutral-400">
                                {String(paramValues[param.key]).split('/').pop() || 'Attached file'}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm border border-neutral-700 transition"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = param.accept || '*/*';
                            input.onchange = (e: any) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  setParamValues({...paramValues, [param.key]: reader.result});
                                };
                                reader.readAsDataURL(file);
                              }
                            };
                            input.click();
                          }}
                        >
                          Select File
                        </button>
                        {paramValues[param.key] && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-green-400 truncate w-20">
                              {typeof paramValues[param.key] === 'string' && paramValues[param.key].startsWith('/library/') ? 'Library' : 'Loaded'}
                            </span>
                            <button className="text-neutral-500 hover:text-red-400" onClick={() => setParamValues({...paramValues, [param.key]: ''})}>&times;</button>
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
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* 3. Input Controls Base (Fixed at bottom) */}
      <div className="shrink-0 p-8 pt-0 z-10 w-full relative z-20">
        <div className="max-w-4xl mx-auto w-full bg-neutral-900/90 backdrop-blur-xl border border-neutral-800/80 rounded-2xl p-4 shadow-2xl flex flex-col gap-4">
          
          {(selectedModel.supportsImageUpload || selectedModel.supportsVideoUpload) && (
            <div
              className="flex flex-wrap gap-4 rounded-xl"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-kie-media')) {
                  e.preventDefault();
                }
              }}
              onDrop={handleSourceDrop}
            >
              {fileData && (
                <div className="relative group w-24 h-24 rounded-xl overflow-hidden border border-neutral-700 bg-neutral-800">
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
                className="w-24 h-24 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-700 hover:bg-neutral-800 hover:border-neutral-500 transition-all text-neutral-400 group"
              >
                <Upload className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                <span className="text-xs font-medium text-center leading-tight">Upload or Drop</span>
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

          <div className="flex items-end gap-3">
            <div className="flex-1 min-h-[60px] relative rounded-xl border border-neutral-700/50 bg-neutral-950 flex focus-within:ring-2 ring-indigo-500/50 focus-within:border-indigo-500/50 transition-all">
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
              disabled={isGenerating || !canSubmit}
              className={cn(
                "h-[60px] px-8 rounded-xl font-medium flex items-center gap-2 transition-all shrink-0 shadow-lg",
                isGenerating 
                  ? "bg-indigo-500/50 text-white cursor-not-allowed" 
                  : "bg-indigo-500 hover:bg-indigo-400 text-white"
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {estimatedCredits ? `${estimatedCredits} ` : ''}
                  Generate
                </>
              )}
            </button>
          </div>
          {estimatedCredits && (
            <div className="flex items-center justify-end gap-2 text-xs text-neutral-400">
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Estimated generation cost: <span className="font-semibold text-neutral-200">{estimatedCredits} credits</span>
              </span>
              {selectedModel.creditEstimator?.label && (
                <span className="text-neutral-600">({selectedModel.creditEstimator.label})</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
