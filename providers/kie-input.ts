import type { AIModel } from '../src/types';
const assignModelImageInput = (inputPayload: Record<string, any>, model: AIModel, imageUrl: string) => {
    if (!model.imageInputKey)
        return false;
    if (model.imageInputMode === 'single') {
        inputPayload[model.imageInputKey] = imageUrl;
    }
    else {
        const existing = inputPayload[model.imageInputKey];
        const existingUrls = Array.isArray(existing) ? existing : existing ? [existing] : [];
        inputPayload[model.imageInputKey] = [...existingUrls, imageUrl];
    }
    return true;
};
const assignModelVideoInput = (inputPayload: Record<string, any>, model: AIModel, videoUrl: string) => {
    if (!model.videoInputKey)
        return false;
    if (model.videoInputMode === 'array') {
        const existing = inputPayload[model.videoInputKey];
        const existingUrls = Array.isArray(existing) ? existing : existing ? [existing] : [];
        inputPayload[model.videoInputKey] = [...existingUrls, videoUrl];
    }
    else {
        inputPayload[model.videoInputKey] = videoUrl;
    }
    return true;
};
const isGeminiOmniVideoModel = (model: AIModel) => model.id === 'gemini-omni-video' || model.familyId === 'google-gemini-omni-flash-1-1';
const normalizeVeoPayload = (input: Record<string, any>, category: AIModel['category']) => {
    input.generation_type = input.generation_type || input.generationType || 'TEXT_2_VIDEO';
    const images = (input.generation_type === 'REFERENCE_2_VIDEO' ? [input.veo_reference_image_urls] : [input.veo_start_frame_url, input.veo_end_frame_url]).flatMap(v => Array.isArray(v) ? v : [v]).filter(Boolean);
    input.image_urls = images.length ? images : input.image_urls || input.imageUrls || [];
    if (!Array.isArray(input.image_urls) || input.image_urls.some((url: unknown) => typeof url !== 'string' || !url.trim())) throw new Error('Veo image URLs must be a list of non-empty URLs');
    if (category === 'image-to-video' && input.image_urls.length && input.generation_type === 'TEXT_2_VIDEO') input.generation_type = 'FIRST_AND_LAST_FRAMES_2_VIDEO';
    input.aspect_ratio = input.aspect_ratio || input.aspectRatio || '16:9';
    if (input.aspect_ratio === 'auto') input.aspect_ratio = 'Auto';
    input.enable_fallback = input.enable_fallback ?? input.enableFallback ?? false;
    input.enable_translation = input.enable_translation ?? input.enableTranslation ?? true;
    input.duration = Number(input.duration ?? 8);
    if (![4,6,8].includes(input.duration)) throw new Error('Veo duration must be 4, 6 or 8 seconds');
    if (input.generation_type === 'REFERENCE_2_VIDEO') {
        if (input.duration !== 8) throw new Error('Veo reference mode requires 8 seconds');
        if (input.model === 'veo3') throw new Error('Veo reference mode requires Fast or Lite');
        if (!input.image_urls.length || input.image_urls.length > 3) throw new Error('Veo reference mode requires 1–3 images');
    } else if (input.generation_type === 'FIRST_AND_LAST_FRAMES_2_VIDEO' && (!input.image_urls.length || input.image_urls.length > 2)) {
        throw new Error('Veo first/last frame mode requires 1–2 images');
    }
    if (input.generation_type === 'TEXT_2_VIDEO') delete input.image_urls;
    for (const key of ['imageUrls','generationType','aspectRatio','enableFallback','enableTranslation','seeds','veo_start_frame_url','veo_end_frame_url','veo_reference_image_urls']) delete input[key];
};
export function prepareKieInput(selectedModel: AIModel, settings: Record<string, any>) {
    const inputPayload = structuredClone(settings);
    const finalImageStr = inputPayload.__sourceImage || '';
    const finalVideoStr = inputPayload.__sourceVideo || '';
    delete inputPayload.__sourceImage;
    delete inputPayload.__sourceVideo;
    if (selectedModel.id === 'google/gemini-3-8-flash-tts') {
        const text = String(inputPayload.prompt || '').trim();
        if (!text)
            throw new Error('Enter the text you want the voice to speak.');
        inputPayload.speakers = [{ speaker_id: 'Speaker 1', voice_name: inputPayload.voice_name || 'Fola' }];
        inputPayload.dialogue_turns = [{ speaker_id: 'Speaker 1', style: inputPayload.style || 'Warm, natural and clear.', text }];
        delete inputPayload.prompt;
        delete inputPayload.voice_name;
        delete inputPayload.style;
        return inputPayload;
    }
    if (selectedModel.id === 'elevenlabs/text-to-speech-turbo-2-5') {
        inputPayload.text = String(inputPayload.prompt || '').trim();
        if (!inputPayload.text)
            throw new Error('Enter the text you want the voice to speak.');
        inputPayload.timestamps = false;
        delete inputPayload.prompt;
        return inputPayload;
    }
    if (finalVideoStr) {
        if (assignModelVideoInput(inputPayload, selectedModel, finalVideoStr)) {
            // Model-specific video source key is defined in the catalog.
        }
        else if (selectedModel.id === 'bytedance/seedance-2') {
            inputPayload.reference_video_urls = [finalVideoStr];
        }
        else if (isGeminiOmniVideoModel(selectedModel)) {
            inputPayload.video_list = [{
                    url: finalVideoStr,
                    start: Number(inputPayload.video_start || 0),
                    ends: Number(inputPayload.video_end || 10),
                }];
        }
        else if (selectedModel.id === 'wan/2-6-video-to-video') {
            inputPayload.video_urls = [finalVideoStr];
        }
        else if (selectedModel.id.includes('wan') && selectedModel.category === 'image-to-video') {
            inputPayload.first_clip_url = finalVideoStr;
        }
        else if (selectedModel.id === 'kling-3.0/video') {
            inputPayload.video_urls = [finalVideoStr];
        }
        else if (selectedModel.id === 'veo-3.1') {
            inputPayload.imageUrls = [finalVideoStr];
        }
        else {
            inputPayload.video_url = finalVideoStr;
        }
    }
    if (finalImageStr && selectedModel.supportsImageUpload) {
        if (assignModelImageInput(inputPayload, selectedModel, finalImageStr)) {
            // Model-specific image source key is defined in the catalog.
        }
        else if (selectedModel.id.includes('grok-imagine')) {
            inputPayload.image_urls = [finalImageStr];
        }
        else if (selectedModel.id.includes('nano-banana')) {
            inputPayload.image_input = [finalImageStr];
        }
        else if (selectedModel.id === 'wan/2-7-image') {
            inputPayload.input_urls = [finalImageStr];
        }
        else if (selectedModel.id === 'happyhorse/image-to-video') {
            inputPayload.image_urls = [finalImageStr];
        }
        else if (selectedModel.id === 'gemini-omni-video') {
            inputPayload.image_urls = [finalImageStr];
        }
        else if (selectedModel.id === 'veo-3.1') {
            inputPayload.image_urls = [finalImageStr];
        }
        else if (selectedModel.id === 'wan/2-5-image-to-video') {
            inputPayload.image_url = finalImageStr;
        }
        else if (selectedModel.id === 'wan/2-6-image-to-video') {
            inputPayload.image_urls = [finalImageStr];
        }
        else if (selectedModel.id.includes('wan') && selectedModel.category === 'image-to-video') {
            inputPayload.first_frame_url = finalImageStr;
        }
        else if (selectedModel.id === 'bytedance/seedance-2') {
            inputPayload.first_frame_url = finalImageStr;
        }
        else if (selectedModel.id === 'bytedance/seedance-1.5-pro') {
            inputPayload.input_urls = [finalImageStr];
        }
        else if (selectedModel.id.includes('bytedance') && selectedModel.category === 'image-to-video') {
            inputPayload.image_url = finalImageStr;
        }
        else if (selectedModel.id === 'kling-3.0/video') {
            inputPayload.image_urls = [finalImageStr];
        }
        else {
            inputPayload.image_url = finalImageStr;
        }
    }
    if (selectedModel.id.startsWith('kling-4.0/')) {
        const input = inputPayload;
        input.duration = Number(input.duration ?? 5);
        input.resolution = input.resolution ?? '720p';
        if (!Number.isInteger(input.duration) || input.duration < 3 || input.duration > 30) throw new Error('Kling 4.0 duration must be 3–30 seconds');
        if (!['720p', '1080p'].includes(input.resolution)) throw new Error('Kling 4.0 resolution must be 720p or 1080p');
        if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 8000) throw new Error('Kling 4.0 prompt must contain 1–8000 characters');
        if (input.aspect_ratio && !['auto', '16:9', '9:16', '1:1', '21:9'].includes(input.aspect_ratio)) throw new Error('Invalid Kling 4.0 aspect ratio');
        const urls = (key: string, max: number) => {
            const values = input[key] ?? [];
            if (!Array.isArray(values) || values.length > max || values.some((v: unknown) => typeof v !== 'string' || !/^https?:\/\//.test(v))) throw new Error(`Kling 4.0 ${key} requires up to ${max} public HTTP URLs`);
            return values as string[];
        };
        const names = new Set<string>();
        if (selectedModel.id.endsWith('/keyframe-to-video')) {
            const middle = urls('keyframe_urls', 8);
            for (const key of ['first_frame_url', 'last_frame_url']) {
                if (!input[key]) delete input[key];
                else if (typeof input[key] !== 'string' || !/^https?:\/\//.test(input[key])) throw new Error(`Invalid Kling 4.0 ${key}`);
            }
            const count = Number(Boolean(input.first_frame_url)) + middle.length + Number(Boolean(input.last_frame_url));
            if (count && !input.first_frame_url) throw new Error('Kling 4.0 keyframes require a first frame');
            if (count > Math.min(10, input.duration + 1)) throw new Error('Kling 4.0 frame count exceeds duration + 1 (maximum 10)');
            if (input.first_frame_url) names.add('first_frame');
            if (input.last_frame_url) names.add('last_frame');
            middle.forEach((_, i) => names.add(`keyframe_${i + 1}`));
        } else {
            const images = urls('image_urls', 10), videos = urls('video_urls', 5);
            if (images.length + videos.length > 15) throw new Error('Kling 4.0 supports at most 15 references');
            if (input.elements?.length || input.voices?.length) throw new Error('Kling 4.0 named elements and voices are not supported in this workspace yet');
            if (typeof input.keep_original_sound !== 'undefined' && typeof input.keep_original_sound !== 'boolean') throw new Error('Kling 4.0 keep_original_sound must be boolean');
            images.forEach((_, i) => names.add(`image_${i + 1}`));
            videos.forEach((_, i) => names.add(`video_${i + 1}`));
        }
        for (const mention of input.prompt.matchAll(/@([\p{L}\p{N}_]+)/gu)) {
            if (!names.has(mention[1])) throw new Error(`Kling 4.0 undeclared reference @${mention[1]}`);
        }
        const allowed = new Set(['prompt', 'duration', 'resolution', 'aspect_ratio', 'callBackUrl', ...(selectedModel.id.endsWith('/keyframe-to-video') ? ['first_frame_url', 'keyframe_urls', 'last_frame_url'] : ['image_urls', 'video_urls', 'keep_original_sound'])]);
        for (const key of Object.keys(input)) if (!allowed.has(key)) delete input[key];
        return input;
    }
    if (/^kling\/2-(?:1|5)-/.test(selectedModel.id)) delete inputPayload.mode;
    if (/^kling\/2-(?:1|5)-/.test(selectedModel.id) && selectedModel.category === 'image-to-video') {
        delete inputPayload.aspect_ratio;
        inputPayload.image_url = inputPayload.image_url || inputPayload.image_urls?.[0] || finalImageStr;
        delete inputPayload.image_urls;
    }
    if (/^kling\/2-6-/.test(selectedModel.id)) {
        if (selectedModel.category === 'image-to-video' && !inputPayload.image_urls?.length) inputPayload.image_urls = inputPayload.image_url ? [inputPayload.image_url] : finalImageStr ? [finalImageStr] : [];
        delete inputPayload.image_url;
        inputPayload.sound = inputPayload.sound ?? true;
        for (const k of ['mode','negative_prompt','seed']) delete inputPayload[k];
        if (selectedModel.category === 'image-to-video') delete inputPayload.aspect_ratio;
    }
    if (/^hailuo\/2-3-/.test(selectedModel.id)) {
        inputPayload.image_url = inputPayload.image_url || finalImageStr;
        delete inputPayload.image_urls;
    }
    if (selectedModel.id === 'bytedance/seedance-2-5') {
        const hasReferences = ['reference_image_urls','reference_video_urls','reference_audio_urls'].some(k => inputPayload[k]?.length);
        if (hasReferences && (inputPayload.first_frame_url || inputPayload.last_frame_url)) throw new Error('Seedance 2.5: first/last frames cannot be combined with multimodal references');
        if (inputPayload.last_frame_url && !inputPayload.first_frame_url) throw new Error('Seedance 2.5 last frame requires a first frame');
        const duration = Number(inputPayload.duration ?? 5);
        if (!Number.isInteger(duration) || duration !== -1 && (duration < 4 || duration > 30)) throw new Error('Seedance 2.5 duration must be 4–30 seconds or -1 (auto)');
        inputPayload.duration = duration;
        if (inputPayload.draft && inputPayload.resolution !== '480p') throw new Error('Seedance 2.5 draft mode requires 480p');
    }
    if (selectedModel.id === 'grok-imagine/video-upscale' || selectedModel.id === 'grok-imagine/video-extend') {
        inputPayload.task_id = inputPayload.task_id || inputPayload.taskId;
        if (!inputPayload.task_id) throw new Error('Grok upscale/extend requires a completed Kie task ID; a video upload cannot replace it');
        delete inputPayload.taskId;
        delete inputPayload.video_url;
        if (selectedModel.id.endsWith('video-extend')) {
            inputPayload.extend_times = String(inputPayload.extend_times || inputPayload.duration || '6');
            inputPayload.extend_at = Number(inputPayload.extend_at ?? 2);
            if (!['6','10'].includes(inputPayload.extend_times) || !Number.isFinite(inputPayload.extend_at) || inputPayload.extend_at < 2) throw new Error('Grok extend requires 6 or 10 seconds and a start time of at least 2 seconds');
            delete inputPayload.duration;
            delete inputPayload.aspect_ratio;
            delete inputPayload.resolution; // Used only for estimating the source-task price.
        }
        for (const k of ['upscale_factor','mode','nsfw_checker']) delete inputPayload[k];
        if (selectedModel.id.endsWith('video-upscale')) delete inputPayload.prompt;
    }
    if (selectedModel.id === 'grok-imagine/image-to-video' && inputPayload.task_id && inputPayload.image_urls?.length) throw new Error('Grok image-to-video accepts image URLs or a task ID, not both');
    if (/^hailuo\/(?:2-3|02)-/.test(selectedModel.id) && inputPayload.resolution === '1080P' && String(inputPayload.duration) === '10') throw new Error('Hailuo 1080P supports 6-second clips only');
    if (selectedModel.id === 'grok-imagine-video-1-5-preview') {
        if (inputPayload.image_urls?.length > 1) throw new Error('Grok 1.5 supports one uploaded image in the current API schema');
        if (inputPayload.loop_url && [inputPayload.first_frame_url,inputPayload.last_frame_url].some(url=>url && url !== inputPayload.loop_url)) throw new Error('Grok loop frame cannot be combined with a different first or last frame');
    }
    if (selectedModel.id.startsWith('gpt-image-2-') && inputPayload.background && inputPayload.background !== 'auto' && (inputPayload.resolution || '1K') !== '1K') throw new Error('GPT Image 2 background control requires 1K resolution');
    const isPixverseExtend = selectedModel.id === 'pixverse-v6/extend';
    if (selectedModel.id === 'pixverse-v6/image-to-video' && inputPayload.template_id) {
        delete inputPayload.duration;
    }
    if (selectedModel.id === 'pixverse-v6/transition') {
        if (!inputPayload.first_frame_image_url || !inputPayload.last_frame_image_url) {
            throw new Error('PixVerse V6 Transition requires a start and end frame.');
        }
    }
    if (selectedModel.id === 'pixverse-v6/image-to-video' && !inputPayload.image_urls?.length) {
        throw new Error('PixVerse V6 Image to Video requires at least one source image.');
    }
    if (selectedModel.id === 'pixverse-v6/reference-to-video') {
        if (!inputPayload.image_references?.length) {
            throw new Error('PixVerse V6 Reference to Video requires at least one reference image.');
        }
        inputPayload.image_references = inputPayload.image_references.map((value: any, index: number) => (typeof value === 'string'
            ? { image_url: value, type: 'subject', ref_name: `ref_${index + 1}` }
            : value));
    }
    if (isPixverseExtend) {
        if (finalVideoStr) {
            delete inputPayload.taskId;
        }
        else if (inputPayload.taskId) {
            delete inputPayload.video_url;
        }
        if (!inputPayload.taskId && !inputPayload.video_url) {
            throw new Error('PixVerse V6 Extend requires a parent task ID or source video.');
        }
    }
    if (selectedModel.id === 'minimax-h3/image-to-video' && !inputPayload.first_frame_url && !inputPayload.last_frame_url) {
        throw new Error('MiniMax H3 Image to Video requires a first or last frame.');
    }
    if (selectedModel.id === 'minimax-h3/reference-to-video' && !inputPayload.reference_image_urls?.length && !inputPayload.reference_video_urls?.length) {
        throw new Error('MiniMax H3 Reference to Video requires an image or video reference.');
    }
    const hasParamImageInput = (selectedModel.params || []).some(p => p.type === 'file' && p.accept?.includes('image') && (Array.isArray(inputPayload[p.key]) ? inputPayload[p.key].length > 0 : Boolean(inputPayload[p.key]))) || Boolean(selectedModel.imageInputKey && inputPayload[selectedModel.imageInputKey])
        || Boolean(inputPayload.image_urls?.length)
        || Boolean(inputPayload.image_url)
        || Boolean(inputPayload.input_urls?.length)
        || Boolean(inputPayload.input_url);
    if ((selectedModel.category === 'image-to-image' || selectedModel.category === 'image-edit') && !finalImageStr && !hasParamImageInput) {
        throw new Error(`${selectedModel.name} requires a source image.`);
    }
    if (selectedModel.requiresImageInput && !finalImageStr && !hasParamImageInput) {
        throw new Error(`${selectedModel.name} requires a source image.`);
    }
    const hasParamVideoInput = Boolean(selectedModel.videoInputKey && (Array.isArray(inputPayload[selectedModel.videoInputKey]) ? inputPayload[selectedModel.videoInputKey].some(Boolean) : inputPayload[selectedModel.videoInputKey]))
        || (selectedModel.params || []).some(p => p.type === 'file' && p.accept?.includes('video') && (Array.isArray(inputPayload[p.key]) ? inputPayload[p.key].some(Boolean) : Boolean(inputPayload[p.key])))
        || Boolean(inputPayload.video_url || inputPayload.video_urls?.some(Boolean) || inputPayload.video_list?.some((v: any) => v?.url));
    if (selectedModel.category === 'video-to-video' && selectedModel.supportsVideoUpload && !finalVideoStr && !hasParamVideoInput && !isPixverseExtend && !selectedModel.id.startsWith('grok-imagine/video-')) {
        throw new Error(`${selectedModel.name} requires a source video.`);
    }
    if (selectedModel.requiresVideoInput && !finalVideoStr && !hasParamVideoInput) {
        throw new Error(`${selectedModel.name} requires a source video.`);
    }
    if (selectedModel.id === 'happyhorse/video-edit') {
        delete inputPayload.duration;
        delete inputPayload.aspect_ratio;
        delete inputPayload.nsfw_checker;
    }
    if (selectedModel.id === 'grok-imagine/text-to-video' && inputPayload.duration !== undefined) inputPayload.duration = Number(inputPayload.duration);
    if (selectedModel.id === 'wan/2-7-video-edit') {
        if (inputPayload.duration !== undefined) inputPayload.duration = Number(inputPayload.duration);
        inputPayload.video_url = inputPayload.video_url || inputPayload.video_urls?.[0] || finalVideoStr;
        delete inputPayload.video_urls;
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
    if (selectedModel.id === 'kling/v3-turbo-image-to-video' && !inputPayload.image_urls?.length) {
        throw new Error('Kling 3.0 Turbo Image to Video requires one source image.');
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
    if (selectedModel.id === 'qwen/image-edit') delete inputPayload.sync_mode;
    if (isGeminiOmniVideoModel(selectedModel)) {
        if (typeof inputPayload.audio_ids === 'string') {
            inputPayload.audio_ids = inputPayload.audio_ids.split(',').map((item: string) => item.trim()).filter(Boolean);
        }
        if (typeof inputPayload.character_ids === 'string') {
            inputPayload.character_ids = inputPayload.character_ids.split(',').map((item: string) => item.trim()).filter(Boolean);
        }
        delete inputPayload.video_start;
        delete inputPayload.video_end;
    }
    if (selectedModel.id === 'gemini-omni-character') {
        if (typeof inputPayload.audio_ids === 'string') {
            inputPayload.audio_ids = inputPayload.audio_ids.split(',').map((item: string) => item.trim()).filter(Boolean);
        }
        if (!inputPayload.image_urls?.length) {
            throw new Error('Gemini Omni Character requires one character image.');
        }
        if (!inputPayload.descriptions) {
            throw new Error('Gemini Omni Character requires a description.');
        }
        delete inputPayload.prompt;
    }
    if (selectedModel.id === 'gemini-omni-audio') {
        if (!inputPayload.audio_id) {
            throw new Error('Gemini Omni Audio requires an audio ID.');
        }
        if (!inputPayload.name) {
            throw new Error('Gemini Omni Audio requires a name.');
        }
        delete inputPayload.prompt;
    }
    if (selectedModel.id === 'omnihuman-1-5' && !inputPayload.audio_url) {
        throw new Error('OmniHuman 1.5 requires an audio file.');
    }
    if (selectedModel.id === 'volcengine-video-to-video-lip-sync' && !inputPayload.audio_url) {
        throw new Error('Volcengine Video-to-Video Lip Sync requires an audio file.');
    }
    if (selectedModel.id === 'veo-3.1') {
        normalizeVeoPayload(inputPayload, selectedModel.category);
        if (selectedModel.category === 'image-to-video' && !inputPayload.image_urls?.length) {
            throw new Error('Veo 3.1 image-to-video requires an uploaded image.');
        }
    }
    if (selectedModel.id === 'veo/extend') {
        inputPayload.task_id = inputPayload.task_id || inputPayload.taskId;
        delete inputPayload.taskId;
        if (!inputPayload.task_id) {
            throw new Error('Veo 3.1 Extend requires a source task ID.');
        }
        if (!inputPayload.prompt) {
            throw new Error('Veo 3.1 Extend requires a prompt.');
        }
    }
    if (selectedModel.id === 'veo/get-4k-video' || selectedModel.id === 'veo/get-1080p-video') {
        if (!inputPayload.taskId) {
            throw new Error(`${selectedModel.name} requires a completed source task ID.`);
        }
        if (selectedModel.id === 'veo/get-4k-video') {inputPayload.task_id = inputPayload.taskId; delete inputPayload.taskId;}
        delete inputPayload.prompt;
    }
    return inputPayload;
}
