import {type ProductionStudio, type ProductionAsset, studioAssetIds} from './assets';
import {MODEL_REGISTRY, defaultsFor, validateParameters, estimateCost, type ProviderId, type Cost} from './registry';
import {prepareKieInput} from '../../providers/kie-input';

export function validateStudio(value: unknown, assets: ProductionAsset[]): asserts value is ProductionStudio {
  const s = value as ProductionStudio;
  const fail = () => {throw new Error('Invalid studio data. Reload before saving.');};
  const text = (v: unknown, max = 10000) => typeof v === 'string' && v.length <= max;
  const ids = (v: unknown) => Array.isArray(v) && v.length <= 100 && v.every(i => text(i, 100));
  if (!s || !text(s.brief) || !text(s.look) || !ids(s.defaultReferenceAssetIds) || !Array.isArray(s.scenes) || s.scenes.length > 100 || !Array.isArray(s.shots) || s.shots.length > 1000) fail();
  if (s.scenes.some(c => !c || !text(c.id,100) || !c.id || !text(c.title,200) || !text(c.notes)) || new Set(s.scenes.map(c => c.id)).size !== s.scenes.length) fail();
  if (s.shots.some(c => !c || !text(c.id,100) || !c.id || !s.scenes.some(scene => scene.id === c.sceneId) || !text(c.title,200) || ![c.action,c.camera,c.lighting,c.dialogue].every(v => text(v)) || !Number.isFinite(c.duration) || c.duration <= 0 || c.duration > 300 || !ids(c.referenceAssetIds) || !text(c.modelId,200) || !text(c.category,100) || !c.settings || typeof c.settings !== 'object' || Array.isArray(c.settings) || JSON.stringify(c.settings).length > 100000) || new Set(s.shots.map(c => c.id)).size !== s.shots.length) fail();
  const q = s.sequence;
  if (!q || !['16:9','9:16','1:1'].includes(q.ratio) || !['720p','1080p'].includes(q.resolution) || ![24,25,30].includes(q.fps) || !Array.isArray(q.clips) || !Array.isArray(q.audio) || q.clips.length > 500 || q.audio.length > 100) fail();
  for (const [clips, audio] of [[q.clips,false],[q.audio,true]] as const) {
    if (new Set(clips.map(c => c.id)).size !== clips.length) fail();
    for (const c of clips) {
      const asset = assets.find(a => a.id === c.assetId);
      if (!c || !text(c.id,100) || !c.id || !asset || (audio ? asset.kind !== 'audio' : !['image','video'].includes(asset.kind)) || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start || c.end > 3600 || !Number.isFinite(c.volume) || c.volume < 0 || c.volume > 2) fail();
      if (asset?.metadata.duration && c.end > asset.metadata.duration + 0.05) fail();
      if (audio && (!Number.isFinite((c as any).offset) || (c as any).offset < 0 || (c as any).offset > 3600 || typeof (c as any).muted !== 'boolean')) fail();
    }
  }
  if (studioAssetIds(s).some(id => !assets.some(a => a.id === id))) fail();
  if (s.shots.some(shot => shot.storyboardAssetId && assets.find(a => a.id === shot.storyboardAssetId)?.kind !== 'image')) fail();
  if (s.shots.some(shot => shot.approvedAssetId && assets.find(a => a.id === shot.approvedAssetId)?.kind === 'audio')) fail();
  if (s.shots.some(shot => shot.inheritReferences!==undefined&&typeof shot.inheritReferences!=='boolean' || shot.takeNotes && (typeof shot.takeNotes!=='object'||Array.isArray(shot.takeNotes)||Object.keys(shot.takeNotes).length>1000||Object.entries(shot.takeNotes).some(([id,note])=>!assets.some(a=>a.id===id)||!text(note,2000))))) fail();
}

export function directionPrompt(studio: ProductionStudio, shot: ProductionStudio['shots'][number]) {
  return [studio.look && `Visual style: ${studio.look}`, shot.action, shot.camera && `Camera: ${shot.camera}`, shot.lighting && `Lighting: ${shot.lighting}`, shot.dialogue && `Dialogue: ${shot.dialogue}`].filter(Boolean).join('\n');
}
export function shotRequest(studio: ProductionStudio, shot: ProductionStudio['shots'][number], assets: ProductionAsset[]) {
  const model = MODEL_REGISTRY.find(m => m.id === shot.modelId && m.category === shot.category);
  if (!model || model.unavailableReason) throw new Error('Choose an available model');
  const input: Record<string, any> = {...defaultsFor(model), ...shot.settings, prompt:directionPrompt(studio,shot)};
  if (!input.prompt.trim() && !model.allowsPromptlessGeneration) throw new Error('Enter shot action before generating');
  const refs = [...new Set([...(shot.inheritReferences===false?[]:studio.defaultReferenceAssetIds), ...shot.referenceAssetIds])].map(id => assets.find(a => a.id === id)!);
  if (refs.some(a => !a) || shot.storyboardAssetId && !assets.some(a => a.id === shot.storyboardAssetId)) throw new Error('A shot reference is unavailable. Reload the Library and reassign it.');
  if (shot.storyboardAssetId && !refs.some(a => a.id === shot.storyboardAssetId)) refs.unshift(assets.find(a => a.id === shot.storyboardAssetId)!);
  for (const kind of ['image','video','audio'] as const) {
    const matching = refs.filter(a => a?.kind === kind);
    if (!matching.length) continue;
    const declared = kind==='image'?model.imageInputKey:kind==='video'?model.videoInputKey:undefined;
    const parameter = declared ? model.params?.find(p=>p.type==='file'&&p.key===declared) : model.params?.find(p => p.type === 'file' && p.accept?.includes(kind) && !/last_frame|tail_image|mask/.test(p.key));
    const key = declared || parameter?.key || (kind === 'image' && model.supportsImageUpload ? '__sourceImage' : kind === 'video' && model.supportsVideoUpload ? '__sourceVideo' : undefined);
    if (!key) throw new Error(`${model.name} does not accept ${kind} references. Remove them or choose another model.`);
    const multiple = key.startsWith('__source') ? false : parameter?.multiple ?? (kind === 'image' ? model.imageInputMode !== 'single' : model.videoInputMode === 'array');
    const max = parameter?.maxFiles || parameter?.maxItems || (multiple ? 100 : 1);
    if (matching.length > max) throw new Error(`${model.name} accepts at most ${max} ${kind} reference(s)`);
    input[key] = multiple ? matching.map(a => a.url) : matching[0].url;
  }
  const hasInput = (kind:string) => refs.some(a=>a.kind===kind) || (model.params||[]).some(p=>p.type==='file'&&p.accept?.includes(kind)&&Boolean(input[p.key])&&(!Array.isArray(input[p.key])||input[p.key].length));
  if ((model.requiresImageInput || ['image-to-image','image-to-video'].includes(model.category)&&!/reference|transition/.test(model.id))&&!hasInput('image')) throw new Error('This workflow needs an image. Attach a storyboard/reference or choose a text workflow.');
  if (model.requiresVideoInput&&!hasInput('video')) throw new Error('This workflow needs a source video. Attach a video reference first.');
  validateParameters(model,input);
  if (model.mappings.some(m=>m.provider==='kie')) prepareKieInput(model,input);
  const videos = refs.filter(a => a?.kind === 'video');
  if (videos.length && model.creditEstimator?.billsSourceVideoDuration && videos.some(a => !Number.isFinite(a.metadata.duration))) throw new Error('Source video duration is unavailable. Re-import with ffprobe installed before estimating this model.');
  const sourceDuration = videos.reduce((sum,a) => sum + (a.metadata.duration || 0),0);
  return {model,input,sourceDuration,sourceType:videos.length?'video' as const:refs.some(a=>a.kind==='image')?'image' as const:undefined};
}
export function batchEstimate(plans:(ReturnType<typeof shotRequest> & {provider?:ProviderId;cost?:Cost})[]) {
  const totals=new Map<string,{usd:number;credits:number;unknown:boolean}>();
  for(const p of plans){const provider=p.provider||p.model.mappings[0].provider;const cost=p.cost||estimateCost(p.model,provider,p.input,p.sourceType,p.sourceDuration);const total=totals.get(provider)||{usd:0,credits:0,unknown:false};total.usd+=cost.usd||0;total.credits+=cost.credits||0;total.unknown ||= cost.usd===null;totals.set(provider,total);}
  return [...totals].map(([provider,c])=>`${provider}: ${c.unknown?'pricing includes unknown costs':`~$${c.usd.toFixed(3)}`}${c.credits?` (${c.credits} credits)`:''}`).join('\n');
}
