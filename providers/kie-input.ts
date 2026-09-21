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
const isVeoModel = (modelId: string) => modelId === 'veo-3.1' || modelId.startsWith('veo/');
const isGeminiOmniVideoModel = (model: AIModel) => model.id === 'gemini-omni-video' || model.familyId === 'google-gemini-omni-flash-1-1';
const normalizeVeoPayload = (inputPayload: Record<string, any>, category: AIModel['category']) => {
    if (inputPayload.seeds !== undefined) {
        const seed = Number(inputPayload.seeds);
        inputPayload.seeds = Number.isFinite(seed) ? Math.max(10000, Math.trunc(seed)) : 10000;
    }
    const imageUrls = [
        inputPayload.veo_start_frame_url,
        inputPayload.veo_end_frame_url,
        inputPayload.veo_reference_image_urls,
    ].flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
    if (imageUrls.length > 0) {
        inputPayload.imageUrls = imageUrls;
    }
    if (inputPayload.imageUrls?.length) {
        if (inputPayload.generationType === 'TEXT_2_VIDEO' && category === 'image-to-video') {
            inputPayload.generationType = 'FIRST_AND_LAST_FRAMES_2_VIDEO';
        }
        if (inputPayload.generationType === 'REFERENCE_2_VIDEO') {
            inputPayload.imageUrls = imageUrls.length > 0 ? imageUrls : inputPayload.imageUrls;
        }
    }
    delete inputPayload.veo_start_frame_url;
    delete inputPayload.veo_end_frame_url;
    delete inputPayload.veo_reference_image_urls;
};
export function prepareKieInput(selectedModel: AIModel, settings: Record<string, any>) {
    const inputPayload = structuredClone(settings);
    const finalImageStr = inputPayload.__sourceImage || '';
    const finalVideoStr = inputPayload.__sourceVideo || '';
    delete inputPayload.__sourceImage;
    delete inputPayload.__sourceVideo;
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
            inputPayload.imageUrls = [finalImageStr];
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
    if (selectedModel.category === 'video-to-video' && selectedModel.supportsVideoUpload && !finalVideoStr && !isPixverseExtend) {
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
    if (selectedModel.id === 'qwen/image-edit') {
        inputPayload.sync_mode = false;
    }
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
        if (selectedModel.category === 'text-to-video') {
            delete inputPayload.imageUrls;
        }
        else if (!inputPayload.imageUrls?.length) {
            throw new Error('Veo 3.1 image-to-video requires an uploaded image.');
        }
    }
    if (selectedModel.id === 'veo/extend') {
        normalizeVeoPayload(inputPayload, selectedModel.category);
        if (!inputPayload.taskId) {
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
        delete inputPayload.prompt;
    }
    return inputPayload;
}
