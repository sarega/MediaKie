import React, { useEffect, useMemo, useState } from 'react';
import { AIModel, SUPPORTED_MODELS, ModelCategory } from '../types';
import { cn } from '../lib/utils';
import { Image, Images, Wand2, Video, FileText, RefreshCw, Search, Settings, Wallet } from 'lucide-react';

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
  'text-to-text': 'Omni Tools'
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

const modelKey = (model: AIModel) => `${model.category}:${model.id}:${model.name}`;
const getFamilyName = (model: AIModel) => model.familyName || model.name;
const getModeName = (model: AIModel) => model.modeName || CATEGORY_NAMES[model.category];
const getModelLabel = (model: AIModel) => {
  if (model.familyName || model.modeName) return `${getFamilyName(model)} - ${getModeName(model)}`;
  return `${model.name} - ${model.provider}`;
};

const sortModels = (models: AIModel[]) => {
  return [...models].sort((a, b) => {
    const byFamily = getFamilyName(a).localeCompare(getFamilyName(b), undefined, { sensitivity: 'base' });
    if (byFamily !== 0) return byFamily;
    const byCategory = CATEGORY_NAMES[a.category].localeCompare(CATEGORY_NAMES[b.category], undefined, { sensitivity: 'base' });
    if (byCategory !== 0) return byCategory;
    return getModeName(a).localeCompare(getModeName(b), undefined, { sensitivity: 'base' });
  });
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
  const [organizeBy, setOrganizeBy] = useState<'use-case' | 'provider'>('use-case');
  const [activeCategory, setActiveCategory] = useState<ModelCategory>(selectedModel.category);
  const [activeProvider, setActiveProvider] = useState(selectedModel.provider);
  const [searchQuery, setSearchQuery] = useState('');

  const groupedByCategory = useMemo(() => {
    return SUPPORTED_MODELS.reduce((acc, model) => {
      if (!acc[model.category]) acc[model.category] = [];
      acc[model.category].push(model);
      return acc;
    }, {} as Partial<Record<ModelCategory, AIModel[]>>);
  }, []);

  const providers = useMemo(() => {
    return Array.from(new Set(SUPPORTED_MODELS.map((model) => model.provider)))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, []);

  const groupedByProvider = useMemo(() => {
    return SUPPORTED_MODELS.reduce((acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = [];
      acc[model.provider].push(model);
      return acc;
    }, {} as Record<string, AIModel[]>);
  }, []);

  const categories = Object.keys(groupedByCategory) as ModelCategory[];
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const displayModels = useMemo(() => {
    if (trimmedSearch) {
      return sortModels(SUPPORTED_MODELS.filter((model) => {
        const haystack = [
          model.name,
          model.provider,
          model.id,
          model.familyName,
          model.modeName,
          CATEGORY_NAMES[model.category],
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(trimmedSearch);
      }));
    }

    const scopedModels = organizeBy === 'provider'
      ? groupedByProvider[activeProvider] || []
      : groupedByCategory[activeCategory] || [];
    return sortModels(scopedModels);
  }, [activeCategory, activeProvider, groupedByCategory, groupedByProvider, organizeBy, trimmedSearch]);

  useEffect(() => {
    setActiveCategory(selectedModel.category);
    setActiveProvider(selectedModel.provider);
  }, [selectedModel]);

  const handleCategoryChange = (category: ModelCategory) => {
    setActiveCategory(category);
    const firstModel = sortModels(groupedByCategory[category] || [])[0];
    if (firstModel) onSelectModel(firstModel);
  };

  const handleProviderChange = (provider: string) => {
    setActiveProvider(provider);
    const firstModel = sortModels(groupedByProvider[provider] || [])[0];
    if (firstModel) onSelectModel(firstModel);
  };

  const selectedVisible = displayModels.some((model) => modelKey(model) === modelKey(selectedModel));

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
          <button
            type="button"
            onClick={() => setOrganizeBy('use-case')}
            className={cn(
              "rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
              organizeBy === 'use-case' ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-200"
            )}
          >
            Use Case
          </button>
          <button
            type="button"
            onClick={() => setOrganizeBy('provider')}
            className={cn(
              "rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
              organizeBy === 'provider' ? "bg-indigo-500 text-white" : "text-neutral-500 hover:text-neutral-200"
            )}
          >
            Provider
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Search
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-neutral-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Find model or mode..."
              className="w-full bg-transparent text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
            />
          </div>
        </div>

        {!trimmedSearch && organizeBy === 'use-case' && (
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
        )}

        {!trimmedSearch && organizeBy === 'provider' && (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Provider
            </label>
            <select
              value={activeProvider}
              onChange={(event) => handleProviderChange(event.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-3 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500"
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {trimmedSearch ? `Results (${displayModels.length})` : 'Model'}
          </label>
          <select
            value={selectedVisible ? modelKey(selectedModel) : ''}
            onChange={(event) => {
              const next = SUPPORTED_MODELS.find((model) => modelKey(model) === event.target.value);
              if (next) onSelectModel(next);
            }}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-3 text-sm text-neutral-100 focus:outline-none focus:border-indigo-500"
          >
            {!selectedVisible && (
              <option value="" disabled>
                Select a matching model
              </option>
            )}
            {displayModels.map((model) => (
              <option key={modelKey(model)} value={modelKey(model)}>
                {getModelLabel(model)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
          <p className="text-sm font-medium text-neutral-100">{getFamilyName(selectedModel)}</p>
          <p className="text-xs text-neutral-500 mt-1">{selectedModel.provider}</p>
          <p className="text-[11px] uppercase tracking-wider text-neutral-600 mt-3">
            {getModeName(selectedModel)} · {CATEGORY_NAMES[selectedModel.category]}
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
