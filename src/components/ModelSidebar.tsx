import React, { useEffect, useMemo, useState } from 'react';
import { AIModel, SUPPORTED_MODELS, ModelCategory } from '../types';
import { cn } from '../lib/utils';
import { Image, Images, Wand2, Video, FileText, RefreshCw, Settings, Wallet } from 'lucide-react';

interface Props {
  selectedModel: AIModel;
  onSelectModel: (model: AIModel) => void;
  onOpenSettings: () => void;
  credits: number | string | null;
  creditError: string;
  isLoadingCredits: boolean;
  onRefreshCredits: () => void;
}

const CATEGORY_NAMES: Record<ModelCategory, string> = {
  'text-to-image': 'Text to Image',
  'image-to-image': 'Image to Image',
  'image-edit': 'Image Edit',
  'text-to-video': 'Text to Video',
  'image-to-video': 'Image to Video',
  'video-to-video': 'Video to Video',
  'text-to-text': 'Text'
};

const CATEGORY_ICONS: Record<ModelCategory, React.ElementType> = {
  'text-to-image': Image,
  'image-to-image': Images,
  'image-edit': Wand2,
  'text-to-video': Video,
  'image-to-video': Video,
  'video-to-video': Video,
  'text-to-text': FileText
};

export function ModelSidebar({
  selectedModel,
  onSelectModel,
  onOpenSettings,
  credits,
  creditError,
  isLoadingCredits,
  onRefreshCredits,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<ModelCategory>(selectedModel.category);

  const groupedModels = useMemo(() => {
    return SUPPORTED_MODELS.reduce((acc, model) => {
      const g = model.category;
      if (!acc[g]) acc[g] = [];
      acc[g].push(model);
      return acc;
    }, {} as Partial<Record<ModelCategory, AIModel[]>>);
  }, []);

  const categories = Object.keys(groupedModels) as ModelCategory[];
  const activeModels = groupedModels[activeCategory] || [];

  useEffect(() => {
    setActiveCategory(selectedModel.category);
  }, [selectedModel.category]);

  const handleCategoryChange = (category: ModelCategory) => {
    setActiveCategory(category);
    const firstModel = groupedModels[category]?.[0];
    if (firstModel) onSelectModel(firstModel);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {categories.map((category) => {
            const Icon = CATEGORY_ICONS[category] || FileText;
            return (
              <button
                key={category}
                onClick={() => handleCategoryChange(category)}
                className={cn(
                  "h-16 rounded-lg border px-3 text-left transition-colors",
                  activeCategory === category
                    ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                    : "border-neutral-800 bg-neutral-950/50 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
                )}
              >
                <Icon className="w-4 h-4 mb-1" />
                <span className="block text-[11px] font-semibold uppercase leading-tight">
                  {CATEGORY_NAMES[category]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Model
          </label>
          <select
            value={`${selectedModel.category}:${selectedModel.id}`}
            onChange={(event) => {
              const [category, id] = event.target.value.split(':');
              const next = SUPPORTED_MODELS.find((model) => model.category === category && model.id === id);
              if (next) onSelectModel(next);
            }}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-3 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500"
          >
            {activeModels.map((model) => (
              <option key={`${model.category}:${model.id}`} value={`${model.category}:${model.id}`}>
                {model.name} - {model.provider}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
          <p className="text-sm font-medium text-neutral-100">{selectedModel.name}</p>
          <p className="text-xs text-neutral-500 mt-1">{selectedModel.provider}</p>
          <p className="text-[11px] uppercase tracking-wider text-neutral-600 mt-3">
            {CATEGORY_NAMES[selectedModel.category]}
          </p>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-neutral-800 shrink-0 space-y-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-neutral-500">Credits</p>
                <p className="text-sm font-semibold text-neutral-100 truncate">
                  {isLoadingCredits ? 'Loading...' : credits ?? '-'}
                </p>
              </div>
            </div>
            <button
              onClick={onRefreshCredits}
              disabled={isLoadingCredits}
              className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition disabled:opacity-50"
              title="Refresh credits"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingCredits ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {creditError && (
            <p className="text-[11px] text-red-400 mt-2 line-clamp-2">{creditError}</p>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200 transition-colors text-left"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
