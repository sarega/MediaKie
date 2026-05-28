export type ModelCategory = 'text-to-image' | 'image-to-image' | 'image-edit' | 'text-to-video' | 'image-to-video' | 'video-to-video' | 'text-to-text';

export interface ModelParamConfig {
  name: string;
  key: string;
  type: 'select' | 'number' | 'text' | 'boolean' | 'slider' | 'file';
  options?: { label: string; value: string | number }[]; // For select
  min?: number;
  max?: number;
  step?: number;
  accept?: string; // For file
  defaultValue: any;
}

export interface AIModel {
  id: string; // The API model name (e.g., 'wan-2.2', 'v-veo-3.1', 'gemini-omni')
  name: string; // Display name
  provider: string; // e.g., 'Wan', 'Google', 'Kling'
  category: ModelCategory;
  description?: string;
  supportsImageUpload?: boolean;
  supportsVideoUpload?: boolean;
  imageInputKey?: string;
  imageInputMode?: 'single' | 'array';
  videoInputKey?: string;
  videoInputMode?: 'single' | 'array';
  params?: ModelParamConfig[];
}

// Common Parameters
const aspectRatioOptions = [
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1', value: '1:1' },
];

const commonVideoParams: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: aspectRatioOptions, defaultValue: '16:9' },
  { name: 'Seed', key: 'seed', type: 'number', min: -1, max: 9999999999, step: 1, defaultValue: -1 },
  { name: 'Negative Prompt', key: 'negative_prompt', type: 'text', defaultValue: '' }
];

const googleImagenParams: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' }], defaultValue: '1:1' },
  { name: 'Negative Prompt', key: 'negative_prompt', type: 'text', defaultValue: '' },
  { name: 'Number of Images', key: 'num_images', type: 'select', options: [{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '4', value: '4' }], defaultValue: '1' },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 0 }
];

const zImageParams: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: aspectRatioOptions, defaultValue: '1:1' },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: true }
];

const qwenTextToImageParams: ModelParamConfig[] = [
  { name: 'Image Size', key: 'image_size', type: 'select', options: [{ label: 'Square HD', value: 'square_hd' }, { label: 'Square', value: 'square' }, { label: 'Portrait 4:3', value: 'portrait_4_3' }, { label: 'Portrait 16:9', value: 'portrait_16_9' }, { label: 'Landscape 4:3', value: 'landscape_4_3' }, { label: 'Landscape 16:9', value: 'landscape_16_9' }], defaultValue: 'square_hd' },
  { name: 'Inference Steps', key: 'num_inference_steps', type: 'number', min: 1, max: 50, step: 1, defaultValue: 30 },
  { name: 'Guidance Scale', key: 'guidance_scale', type: 'number', min: 0, max: 20, step: 0.1, defaultValue: 2.5 },
  { name: 'Safety Checker', key: 'enable_safety_checker', type: 'boolean', defaultValue: true },
  { name: 'Output Format', key: 'output_format', type: 'select', options: [{ label: 'PNG', value: 'png' }, { label: 'JPG', value: 'jpg' }], defaultValue: 'png' },
  { name: 'Negative Prompt', key: 'negative_prompt', type: 'text', defaultValue: ' ' },
  { name: 'Acceleration', key: 'acceleration', type: 'select', options: [{ label: 'None', value: 'none' }, { label: 'Regular', value: 'regular' }, { label: 'High', value: 'high' }], defaultValue: 'none' }
];

const seedream3TextToImageParams: ModelParamConfig[] = [
  { name: 'Image Size', key: 'image_size', type: 'select', options: [{ label: 'Square HD', value: 'square_hd' }, { label: 'Square', value: 'square' }, { label: 'Portrait 4:3', value: 'portrait_4_3' }, { label: 'Portrait 16:9', value: 'portrait_16_9' }, { label: 'Landscape 4:3', value: 'landscape_4_3' }, { label: 'Landscape 16:9', value: 'landscape_16_9' }], defaultValue: 'square_hd' },
  { name: 'Guidance Scale', key: 'guidance_scale', type: 'number', min: 0, max: 20, step: 0.1, defaultValue: 2.5 },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 0 }
];

const seedream4TextToImageParams: ModelParamConfig[] = [
  { name: 'Image Size', key: 'image_size', type: 'select', options: [{ label: 'Square HD', value: 'square_hd' }, { label: 'Square', value: 'square' }, { label: 'Portrait 4:3', value: 'portrait_4_3' }, { label: 'Portrait 16:9', value: 'portrait_16_9' }, { label: 'Landscape 4:3', value: 'landscape_4_3' }, { label: 'Landscape 16:9', value: 'landscape_16_9' }], defaultValue: 'square_hd' },
  { name: 'Resolution', key: 'image_resolution', type: 'select', options: [{ label: '1K', value: '1K' }, { label: '2K', value: '2K' }, { label: '4K', value: '4K' }], defaultValue: '1K' },
  { name: 'Max Images', key: 'max_images', type: 'select', options: [{ label: '1', value: 1 }, { label: '2', value: 2 }, { label: '4', value: 4 }], defaultValue: 1 },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 0 },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: true }
];

const seedream45TextToImageParams: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' }], defaultValue: '1:1' },
  { name: 'Quality', key: 'quality', type: 'select', options: [{ label: 'Basic', value: 'basic' }, { label: 'High', value: 'high' }], defaultValue: 'basic' },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: false }
];

const seedream4EditParams: ModelParamConfig[] = [
  { name: 'Image Size', key: 'image_size', type: 'select', options: [{ label: 'Square HD', value: 'square_hd' }, { label: 'Square', value: 'square' }, { label: 'Portrait 4:3', value: 'portrait_4_3' }, { label: 'Portrait 16:9', value: 'portrait_16_9' }, { label: 'Landscape 4:3', value: 'landscape_4_3' }, { label: 'Landscape 16:9', value: 'landscape_16_9' }], defaultValue: 'square_hd' },
  { name: 'Resolution', key: 'image_resolution', type: 'select', options: [{ label: '1K', value: '1K' }, { label: '2K', value: '2K' }, { label: '4K', value: '4K' }], defaultValue: '1K' },
  { name: 'Max Images', key: 'max_images', type: 'select', options: [{ label: '1', value: 1 }, { label: '2', value: 2 }, { label: '4', value: 4 }], defaultValue: 1 },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 0 },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: true }
];

const seedream45EditParams: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' }], defaultValue: '1:1' },
  { name: 'Quality', key: 'quality', type: 'select', options: [{ label: 'Basic', value: 'basic' }, { label: 'High', value: 'high' }], defaultValue: 'basic' },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: true }
];

const wanImageParams: ModelParamConfig[] = [
  { name: 'Number of Images', key: 'n', type: 'select', options: [{ label: '1', value: 1 }, { label: '2', value: 2 }, { label: '4', value: 4 }], defaultValue: 1 },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '1K', value: '1K' }, { label: '2K', value: '2K' }], defaultValue: '2K' },
  { name: 'Sequential', key: 'enable_sequential', type: 'boolean', defaultValue: false },
  { name: 'Thinking Mode', key: 'thinking_mode', type: 'boolean', defaultValue: false },
  { name: 'Watermark', key: 'watermark', type: 'boolean', defaultValue: false },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 0 }
];

const bytedanceV1Params: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: aspectRatioOptions, defaultValue: '16:9' },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }], defaultValue: '720p' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '5s', value: '5' }, { label: '10s', value: '10' }], defaultValue: '5' },
  { name: 'Fixed Camera', key: 'camera_fixed', type: 'boolean', defaultValue: false },
  { name: 'Seed', key: 'seed', type: 'number', min: -1, max: 2147483647, step: 1, defaultValue: -1 },
  { name: 'Safety Checker', key: 'enable_safety_checker', type: 'boolean', defaultValue: true },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: false }
];

const seedance15Params: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: aspectRatioOptions, defaultValue: '16:9' },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }], defaultValue: '720p' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '8s', value: '8' }], defaultValue: '8' },
  { name: 'Fixed Lens', key: 'fixed_lens', type: 'boolean', defaultValue: false },
  { name: 'Generate Audio', key: 'generate_audio', type: 'boolean', defaultValue: false },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: false }
];

const seedance2Params: ModelParamConfig[] = [
  { name: 'Last Frame URL', key: 'last_frame_url', type: 'file', accept: 'image/*', defaultValue: '' },
  { name: 'Reference Image URL', key: 'reference_image_urls', type: 'file', accept: 'image/*', defaultValue: '' },
  { name: 'Reference Video URL', key: 'reference_video_urls', type: 'file', accept: 'video/*', defaultValue: '' },
  { name: 'Reference Audio URL', key: 'reference_audio_urls', type: 'file', accept: 'audio/*', defaultValue: '' },
  { name: 'Return Last Frame', key: 'return_last_frame', type: 'boolean', defaultValue: false },
  { name: 'Generate Audio', key: 'generate_audio', type: 'boolean', defaultValue: false },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }], defaultValue: '720p' },
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: aspectRatioOptions, defaultValue: '16:9' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '5s', value: 5 }, { label: '10s', value: 10 }, { label: '15s', value: 15 }], defaultValue: 5 },
  { name: 'Web Search', key: 'web_search', type: 'boolean', defaultValue: false }
];

const kling30Params: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: aspectRatioOptions, defaultValue: '16:9' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '3s', value: '3' }, { label: '5s', value: '5' }, { label: '10s', value: '10' }, { label: '15s', value: '15' }], defaultValue: '5' },
  { name: 'Mode', key: 'mode', type: 'select', options: [{ label: 'Standard', value: 'std' }, { label: 'Pro', value: 'pro' }, { label: '4K', value: '4K' }], defaultValue: 'pro' },
  { name: 'Sound', key: 'sound', type: 'boolean', defaultValue: true }
];

const hailuoTextParams: ModelParamConfig[] = [
  { name: 'Prompt Optimizer', key: 'prompt_optimizer', type: 'boolean', defaultValue: true }
];

const happyHorseVideoParams: ModelParamConfig[] = [
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }], defaultValue: '1080p' },
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: aspectRatioOptions, defaultValue: '16:9' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '5s', value: 5 }, { label: '10s', value: 10 }], defaultValue: 5 },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 0 }
];

const happyHorseImageToVideoParams: ModelParamConfig[] = [
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }], defaultValue: '1080p' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '5s', value: 5 }, { label: '10s', value: 10 }], defaultValue: 5 },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 0 }
];

const veo31Params: ModelParamConfig[] = [
  { name: 'Veo Model', key: 'model', type: 'select', options: [{ label: 'Quality', value: 'veo3' }, { label: 'Fast', value: 'veo3_fast' }], defaultValue: 'veo3_fast' },
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: 'Auto', value: 'auto' }], defaultValue: '16:9' },
  { name: 'Generation Type', key: 'generationType', type: 'select', options: [{ label: 'Text to Video', value: 'TEXT_2_VIDEO' }, { label: 'First/Last Frames', value: 'FIRST_AND_LAST_FRAMES_2_VIDEO' }, { label: 'Reference to Video', value: 'REFERENCE_2_VIDEO' }], defaultValue: 'TEXT_2_VIDEO' },
  { name: 'Translate Prompt', key: 'enableTranslation', type: 'boolean', defaultValue: true },
  { name: 'Fallback', key: 'enableFallback', type: 'boolean', defaultValue: false },
  { name: 'Watermark', key: 'watermark', type: 'text', defaultValue: '' },
  { name: 'Seed', key: 'seeds', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 0 }
];

const geminiOmniVideoParams: ModelParamConfig[] = [
  { name: 'Audio IDs (comma separated)', key: 'audio_ids', type: 'text', defaultValue: '' },
  { name: 'Character IDs (comma separated)', key: 'character_ids', type: 'text', defaultValue: '' },
  { name: 'Video Start', key: 'video_start', type: 'number', min: 0, max: 9999, step: 1, defaultValue: 0 },
  { name: 'Video End', key: 'video_end', type: 'number', min: 1, max: 9999, step: 1, defaultValue: 10 },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '4s', value: '4' }, { label: '6s', value: '6' }, { label: '8s', value: '8' }], defaultValue: '4' }
];

const wanTextToVideoParams: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: aspectRatioOptions, defaultValue: '16:9' },
  { name: 'Negative Prompt', key: 'negative_prompt', type: 'text', defaultValue: '' },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '1080p', value: '1080p' }, { label: '720p', value: '720p' }], defaultValue: '1080p' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '5s', value: '5' }, { label: '10s', value: '10' }], defaultValue: '5' },
  { name: 'Prompt Expansion', key: 'enable_prompt_expansion', type: 'boolean', defaultValue: true },
  { name: 'Prompt Extend', key: 'prompt_extend', type: 'boolean', defaultValue: true },
  { name: 'Watermark', key: 'watermark', type: 'boolean', defaultValue: false },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 123456 },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: false }
];

const wanImageToVideoParams: ModelParamConfig[] = [
  { name: 'Negative Prompt', key: 'negative_prompt', type: 'text', defaultValue: '' },
  { name: 'Last Frame URL', key: 'last_frame_url', type: 'file', accept: 'image/*', defaultValue: '' },
  { name: 'Audio URL', key: 'audio_url', type: 'file', accept: 'audio/*', defaultValue: '' },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }], defaultValue: '720p' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '5s', value: '5' }, { label: '10s', value: '10' }], defaultValue: '5' },
  { name: 'Prompt Expansion', key: 'enable_prompt_expansion', type: 'boolean', defaultValue: true },
  { name: 'Prompt Extend', key: 'prompt_extend', type: 'boolean', defaultValue: true },
  { name: 'Watermark', key: 'watermark', type: 'boolean', defaultValue: false },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 123456 },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: false }
];

const wanVideoToVideoParams: ModelParamConfig[] = [
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }], defaultValue: '1080p' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '5s', value: '5' }, { label: '10s', value: '10' }], defaultValue: '5' },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: false }
];

const kling21Params: ModelParamConfig[] = [
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '5s', value: '5' }, { label: '10s', value: '10' }], defaultValue: '5' },
  { name: 'Mode', key: 'mode', type: 'select', options: [{ label: 'Standard', value: 'std' }, { label: 'Pro', value: 'pro' }], defaultValue: 'std' }
];

const kling25Params: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: aspectRatioOptions, defaultValue: '16:9' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '5s', value: '5' }, { label: '10s', value: '10' }], defaultValue: '5' },
  { name: 'Mode', key: 'mode', type: 'select', options: [{ label: 'Pro', value: 'pro' }], defaultValue: 'pro' }
];

const hailuo23Params: ModelParamConfig[] = [
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '6s', value: '6' }, { label: '10s', value: '10' }], defaultValue: '6' },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '720p', value: '720p' }, { label: '1080p', value: '1080p' }], defaultValue: '1080p' },
  { name: 'Prompt Optimizer', key: 'prompt_optimizer', type: 'boolean', defaultValue: true }
];

const topazVideoUpscaleParams: ModelParamConfig[] = [
  { name: 'Upscale Factor', key: 'upscale_factor', type: 'select', options: [{ label: '2x', value: '2' }, { label: '4x', value: '4' }], defaultValue: '2' }
];

const grokImageToVideoParams: ModelParamConfig[] = [
  { name: 'Task ID (Optional)', key: 'task_id', type: 'text', defaultValue: '' },
  { name: 'Mode', key: 'mode', type: 'select', options: [{ label: 'Fun', value: 'fun' }, { label: 'Normal', value: 'normal' }, { label: 'Spicy', value: 'spicy' }], defaultValue: 'normal' },
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: '2:3', value: '2:3' }, { label: '3:2', value: '3:2' }, { label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }], defaultValue: '16:9' },
  { name: 'Duration', key: 'duration', type: 'select', options: [{ label: '6s', value: '6' }, { label: '10s', value: '10' }], defaultValue: '6' },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '480p', value: '480p' }, { label: '720p', value: '720p' }], defaultValue: '480p' }
];

const grokTextToImageParams: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: '2:3', value: '2:3' }, { label: '3:2', value: '3:2' }, { label: '1:1', value: '1:1' }, { label: '9:16', value: '9:16' }, { label: '16:9', value: '16:9' }], defaultValue: '3:2' }
];

const fluxImageToImageParams: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' }], defaultValue: '1:1' },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '1K', value: '1K' }, { label: '2K', value: '2K' }], defaultValue: '1K' },
  { name: 'NSFW Checker', key: 'nsfw_checker', type: 'boolean', defaultValue: false }
];

const topazImageUpscaleParams: ModelParamConfig[] = [
  { name: 'Upscale Factor', key: 'upscale_factor', type: 'select', options: [{ label: '2x', value: '2' }, { label: '4x', value: '4' }], defaultValue: '2' }
];

const ideogramParams: ModelParamConfig[] = [
  { name: 'Rendering Speed', key: 'rendering_speed', type: 'select', options: [{ label: 'Turbo', value: 'TURBO' }, { label: 'Balanced', value: 'BALANCED' }, { label: 'Quality', value: 'QUALITY' }], defaultValue: 'BALANCED' },
  { name: 'Style', key: 'style', type: 'select', options: [{ label: 'Auto', value: 'AUTO' }, { label: 'General', value: 'GENERAL' }, { label: 'Realistic', value: 'REALISTIC' }, { label: 'Design', value: 'DESIGN' }, { label: 'Anime', value: 'ANIME' }], defaultValue: 'AUTO' },
  { name: 'Image Size', key: 'image_size', type: 'select', options: [{ label: 'Square HD', value: 'square_hd' }, { label: 'Square', value: 'square' }, { label: 'Portrait 4:3', value: 'portrait_4_3' }, { label: 'Portrait 16:9', value: 'portrait_16_9' }, { label: 'Landscape 4:3', value: 'landscape_4_3' }, { label: 'Landscape 16:9', value: 'landscape_16_9' }], defaultValue: 'square_hd' },
  { name: 'Expand Prompt', key: 'expand_prompt', type: 'boolean', defaultValue: true },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 123456 },
  { name: 'Negative Prompt', key: 'negative_prompt', type: 'text', defaultValue: '' }
];

const ideogramEditParams: ModelParamConfig[] = [
  { name: 'Mask URL', key: 'mask_url', type: 'file', accept: 'image/*', defaultValue: '' },
  { name: 'Rendering Speed', key: 'rendering_speed', type: 'select', options: [{ label: 'Turbo', value: 'TURBO' }, { label: 'Balanced', value: 'BALANCED' }, { label: 'Quality', value: 'QUALITY' }], defaultValue: 'BALANCED' },
  { name: 'Style', key: 'style', type: 'select', options: [{ label: 'Auto', value: 'AUTO' }, { label: 'General', value: 'GENERAL' }, { label: 'Realistic', value: 'REALISTIC' }, { label: 'Design', value: 'DESIGN' }, { label: 'Anime', value: 'ANIME' }], defaultValue: 'AUTO' },
  { name: 'Expand Prompt', key: 'expand_prompt', type: 'boolean', defaultValue: true },
  { name: 'Number of Images', key: 'num_images', type: 'select', options: [{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '4', value: '4' }], defaultValue: '1' },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 123456 }
];

const gptImage15Params: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '3:2', value: '3:2' }, { label: '2:3', value: '2:3' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }], defaultValue: '1:1' },
  { name: 'Quality', key: 'quality', type: 'select', options: [{ label: 'Low', value: 'low' }, { label: 'Medium', value: 'medium' }, { label: 'High', value: 'high' }], defaultValue: 'medium' }
];

const gptImage2Params: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: 'Auto', value: 'auto' }, { label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' }], defaultValue: 'auto' }
];

const qwenImageToImageParams: ModelParamConfig[] = [
  { name: 'Strength', key: 'strength', type: 'slider', min: 0, max: 1, step: 0.05, defaultValue: 0.8 },
  { name: 'Output Format', key: 'output_format', type: 'select', options: [{ label: 'PNG', value: 'png' }, { label: 'JPG', value: 'jpg' }], defaultValue: 'png' },
  { name: 'Acceleration', key: 'acceleration', type: 'select', options: [{ label: 'None', value: 'none' }, { label: 'Regular', value: 'regular' }, { label: 'High', value: 'high' }], defaultValue: 'none' },
  { name: 'Negative Prompt', key: 'negative_prompt', type: 'text', defaultValue: 'blurry, ugly' },
  { name: 'Inference Steps', key: 'num_inference_steps', type: 'number', min: 1, max: 50, step: 1, defaultValue: 30 },
  { name: 'Guidance Scale', key: 'guidance_scale', type: 'number', min: 0, max: 20, step: 0.1, defaultValue: 2.5 },
  { name: 'Safety Checker', key: 'enable_safety_checker', type: 'boolean', defaultValue: true }
];

const qwenImageEditParams: ModelParamConfig[] = [
  { name: 'Image Size', key: 'image_size', type: 'select', options: [{ label: 'Square HD', value: 'square_hd' }, { label: 'Square', value: 'square' }, { label: 'Portrait 4:3', value: 'portrait_4_3' }, { label: 'Portrait 16:9', value: 'portrait_16_9' }, { label: 'Landscape 4:3', value: 'landscape_4_3' }, { label: 'Landscape 16:9', value: 'landscape_16_9' }], defaultValue: 'landscape_4_3' },
  { name: 'Output Format', key: 'output_format', type: 'select', options: [{ label: 'PNG', value: 'png' }, { label: 'JPG', value: 'jpg' }], defaultValue: 'png' },
  { name: 'Acceleration', key: 'acceleration', type: 'select', options: [{ label: 'None', value: 'none' }, { label: 'Regular', value: 'regular' }, { label: 'High', value: 'high' }], defaultValue: 'none' },
  { name: 'Inference Steps', key: 'num_inference_steps', type: 'number', min: 1, max: 50, step: 1, defaultValue: 25 },
  { name: 'Guidance Scale', key: 'guidance_scale', type: 'number', min: 0, max: 20, step: 0.1, defaultValue: 4 },
  { name: 'Safety Checker', key: 'enable_safety_checker', type: 'boolean', defaultValue: true },
  { name: 'Negative Prompt', key: 'negative_prompt', type: 'text', defaultValue: 'blurry, ugly' }
];

const qwen2ImageEditParams: ModelParamConfig[] = [
  { name: 'Image Size', key: 'image_size', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' }], defaultValue: '16:9' },
  { name: 'Output Format', key: 'output_format', type: 'select', options: [{ label: 'PNG', value: 'png' }, { label: 'JPG', value: 'jpg' }], defaultValue: 'png' },
  { name: 'Seed', key: 'seed', type: 'number', min: 0, max: 2147483647, step: 1, defaultValue: 0 }
];

const nanoBananaParams: ModelParamConfig[] = [
  { name: 'Aspect Ratio', key: 'aspect_ratio', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '1:4', value: '1:4' }, { label: '1:8', value: '1:8' }, { label: '2:3', value: '2:3' }, { label: '3:2', value: '3:2' }, { label: '3:4', value: '3:4' }, { label: '4:1', value: '4:1' }, { label: '4:3', value: '4:3' }, { label: '4:5', value: '4:5' }, { label: '5:4', value: '5:4' }, { label: '8:1', value: '8:1' }, { label: '9:16', value: '9:16' }, { label: '16:9', value: '16:9' }, { label: '21:9', value: '21:9' }, { label: 'Auto', value: 'auto' }], defaultValue: 'auto' },
  { name: 'Resolution', key: 'resolution', type: 'select', options: [{ label: '1K', value: '1K' }, { label: '2K', value: '2K' }, { label: '4K', value: '4K' }], defaultValue: '1K' },
  { name: 'Output Format', key: 'output_format', type: 'select', options: [{ label: 'JPG', value: 'jpg' }, { label: 'PNG', value: 'png' }], defaultValue: 'jpg' }
];

const nanoBananaClassicParams: ModelParamConfig[] = [
  { name: 'Image Size', key: 'image_size', type: 'select', options: [{ label: '1:1', value: '1:1' }, { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' }, { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' }], defaultValue: '1:1' },
  { name: 'Output Format', key: 'output_format', type: 'select', options: [{ label: 'PNG', value: 'png' }, { label: 'JPG', value: 'jpg' }], defaultValue: 'png' }
];

export const SUPPORTED_MODELS: AIModel[] = [
  // Image Models
  { id: 'wan/2-7-image', name: 'Wan 2.7 Image', provider: 'Wan', category: 'text-to-image', params: wanImageParams },
  { id: 'bytedance/seedream', name: 'Seedream 3.0', provider: 'Bytedance', category: 'text-to-image', params: seedream3TextToImageParams },
  { id: 'bytedance/seedream-v4-text-to-image', name: 'Seedream 4.0', provider: 'Bytedance', category: 'text-to-image', params: seedream4TextToImageParams },
  { id: 'seedream/4.5-text-to-image', name: 'Seedream 4.5', provider: 'Bytedance', category: 'text-to-image', params: seedream45TextToImageParams },
  { id: 'seedream/5-lite-text-to-image', name: 'Seedream 5.0 Lite', provider: 'Bytedance', category: 'text-to-image', params: seedream45TextToImageParams },
  { id: 'google/imagen4-fast', name: 'Imagen 4 Fast', provider: 'Google', category: 'text-to-image', params: googleImagenParams },
  { id: 'google/imagen4', name: 'Imagen 4', provider: 'Google', category: 'text-to-image', params: googleImagenParams },
  { id: 'google/imagen4-ultra', name: 'Imagen 4 Ultra', provider: 'Google', category: 'text-to-image', params: googleImagenParams },
  { id: 'qwen/text-to-image', name: 'Qwen Image', provider: 'Alibaba', category: 'text-to-image', params: qwenTextToImageParams },
  { id: 'grok-imagine/text-to-image', name: 'Grok Images', provider: 'xAI', category: 'text-to-image', params: grokTextToImageParams },
  { id: 'google/nano-banana', name: 'Nano Banana', provider: 'Google', category: 'text-to-image', params: nanoBananaClassicParams },
  { id: 'nano-banana-2', name: 'Nanobanana 2', provider: 'Unknown', category: 'text-to-image', params: nanoBananaParams },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', provider: 'Google', category: 'text-to-image', params: nanoBananaParams },
  { id: 'z-image', name: 'Z-Image', provider: 'Z-Image', category: 'text-to-image', params: zImageParams },
  { id: 'flux-2/pro-text-to-image', name: 'Flux 2 Pro', provider: 'Flux', category: 'text-to-image', params: fluxImageToImageParams },
  { id: 'flux-2/flex-text-to-image', name: 'Flux 2 Flex', provider: 'Flux', category: 'text-to-image', params: fluxImageToImageParams },
  { id: 'gpt-image/1.5-text-to-image', name: 'GPT Image 1.5', provider: 'OpenAI', category: 'text-to-image', params: gptImage15Params },
  { id: 'gpt-image-2-text-to-image', name: 'GPT Image 2', provider: 'OpenAI', category: 'text-to-image', params: gptImage2Params },
  { id: 'ideogram/v3-text-to-image', name: 'Ideogram V3', provider: 'Ideogram', category: 'text-to-image', params: ideogramParams },
  { id: 'qwen2/text-to-image', name: 'Qwen2 Image', provider: 'Alibaba', category: 'text-to-image', params: qwen2ImageEditParams },
  { id: 'wan/2-7-image-pro', name: 'Wan 2.7 Image Pro', provider: 'Wan', category: 'text-to-image', params: wanImageParams },

  // Image Models (Image to Image)
  { id: 'seedream/5-lite-image-to-image', name: 'Seedream 5.0 Lite I2I', provider: 'Bytedance', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'image_urls', imageInputMode: 'array', params: seedream45EditParams },
  { id: 'google/nano-banana-edit', name: 'Nano Banana Edit', provider: 'Google', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'image_urls', imageInputMode: 'array', params: nanoBananaClassicParams },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro I2I', provider: 'Google', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'image_input', imageInputMode: 'array', params: nanoBananaParams },
  { id: 'flux-2/pro-image-to-image', name: 'Flux 2 Pro I2I', provider: 'Flux', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'input_urls', imageInputMode: 'array', params: fluxImageToImageParams },
  { id: 'flux-2/flex-image-to-image', name: 'Flux 2 Flex I2I', provider: 'Flux', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'input_urls', imageInputMode: 'array', params: fluxImageToImageParams },
  { id: 'grok-imagine/image-to-image', name: 'Grok Imagine I2I', provider: 'xAI', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'image_urls', imageInputMode: 'array', params: [] },
  { id: 'gpt-image/1.5-image-to-image', name: 'GPT Image 1.5 I2I', provider: 'OpenAI', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'input_urls', imageInputMode: 'array', params: gptImage15Params },
  { id: 'gpt-image-2-image-to-image', name: 'GPT Image 2 I2I', provider: 'OpenAI', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'input_urls', imageInputMode: 'array', params: gptImage2Params },
  { id: 'qwen/image-to-image', name: 'Qwen I2I', provider: 'Alibaba', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: qwenImageToImageParams },
  { id: 'ideogram/v3-remix', name: 'Ideogram V3 Remix', provider: 'Ideogram', category: 'image-to-image', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: ideogramEditParams },

  // Image Models (Image Edit)
  { id: 'bytedance/seedream-v4-edit', name: 'Seedream 4.0 Edit', provider: 'Bytedance', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image_urls', imageInputMode: 'array', params: seedream4EditParams },
  { id: 'seedream/4.5-edit', name: 'Seedream 4.5 Edit', provider: 'Bytedance', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image_urls', imageInputMode: 'array', params: seedream45EditParams },
  { id: 'qwen/image-edit', name: 'Qwen Edit', provider: 'Alibaba', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: qwenImageEditParams },
  { id: 'qwen2/image-edit', name: 'Qwen2 Edit', provider: 'Alibaba', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: qwen2ImageEditParams },
  { id: 'topaz/image-upscale', name: 'Topaz Image Upscale', provider: 'Topaz', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: topazImageUpscaleParams },
  { id: 'recraft/remove-background', name: 'Recraft Remove BG', provider: 'Recraft', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image', imageInputMode: 'single', params: [] },
  { id: 'recraft/crisp-upscale', name: 'Recraft Crisp Upscale', provider: 'Recraft', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image', imageInputMode: 'single', params: [] },
  { id: 'ideogram/v3-edit', name: 'Ideogram V3 Edit', provider: 'Ideogram', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: ideogramEditParams },
  { id: 'ideogram/character-edit', name: 'Ideogram Character Edit', provider: 'Ideogram', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: ideogramEditParams },
  { id: 'ideogram/character-remix', name: 'Ideogram Character Remix', provider: 'Ideogram', category: 'image-edit', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: ideogramEditParams },
  
  // Video Models (Text to Video)
  { id: 'grok-imagine/text-to-video', name: 'Grok Imagine T2V', provider: 'xAI', category: 'text-to-video', params: grokImageToVideoParams },
  { id: 'wan/2-5-text-to-video', name: 'Wan 2.5', provider: 'Wan', category: 'text-to-video', params: wanTextToVideoParams },
  { id: 'wan/2-6-text-to-video', name: 'Wan 2.6', provider: 'Wan', category: 'text-to-video', params: wanTextToVideoParams },
  { id: 'wan/2-7-text-to-video', name: 'Wan 2.7', provider: 'Wan', category: 'text-to-video', params: wanTextToVideoParams },
  { id: 'veo-3.1', name: 'Veo 3.1', provider: 'Google', category: 'text-to-video', params: veo31Params },
  { id: 'bytedance/v1-lite-text-to-video', name: 'Seedance V1 Lite', provider: 'Bytedance', category: 'text-to-video', params: bytedanceV1Params },
  { id: 'bytedance/v1-pro-text-to-video', name: 'Seedance V1 Pro', provider: 'Bytedance', category: 'text-to-video', params: bytedanceV1Params },
  { id: 'bytedance/seedance-1.5-pro', name: 'Seedance 1.5 Pro', provider: 'Bytedance', category: 'text-to-video', params: seedance15Params },
  { id: 'bytedance/seedance-2', name: 'Seedance 2.0', provider: 'Bytedance', category: 'text-to-video', params: seedance2Params },
  { id: 'kling-3.0/video', name: 'Kling 3.0', provider: 'Kuaishou', category: 'text-to-video', params: kling30Params },
  { id: 'kling/2-6-text-to-video', name: 'Kling 2.6', provider: 'Kuaishou', category: 'text-to-video', params: kling25Params },
  { id: 'kling/2-5-turbo-text-to-video-pro', name: 'Kling 2.5 Turbo Pro', provider: 'Kuaishou', category: 'text-to-video', params: kling25Params },
  { id: 'kling/2-1-master-text-to-video', name: 'Kling 2.1 Master', provider: 'Kuaishou', category: 'text-to-video', params: kling21Params },
  { id: 'kling/2-1-pro', name: 'Kling 2.1 Pro', provider: 'Kuaishou', category: 'text-to-video', params: kling21Params },
  { id: 'kling/2-1-standard', name: 'Kling 2.1 Standard', provider: 'Kuaishou', category: 'text-to-video', params: kling21Params },
  { id: 'hailuo/02-text-to-video-pro', name: 'Hailuo Pro', provider: 'Minimax', category: 'text-to-video', params: hailuoTextParams },
  { id: 'hailuo/02-text-to-video-standard', name: 'Hailuo Standard', provider: 'Minimax', category: 'text-to-video', params: hailuoTextParams },
  { id: 'happyhorse/text-to-video', name: 'HappyHorse', provider: 'HappyHorse', category: 'text-to-video', params: happyHorseVideoParams },
  { id: 'gemini-omni-video', name: 'Gemini Omni Video', provider: 'Google', category: 'text-to-video', supportsImageUpload: true, supportsVideoUpload: true, params: geminiOmniVideoParams },

  // Video Models (Image to Video)
  { id: 'wan/2-5-image-to-video', name: 'Wan 2.5 I2V', provider: 'Wan', category: 'image-to-video', supportsImageUpload: true, params: wanImageToVideoParams },
  { id: 'wan/2-6-image-to-video', name: 'Wan 2.6 I2V', provider: 'Wan', category: 'image-to-video', supportsImageUpload: true, params: wanImageToVideoParams },
  { id: 'wan/2-7-image-to-video', name: 'Wan 2.7 I2V', provider: 'Wan', category: 'image-to-video', supportsImageUpload: true, params: wanImageToVideoParams },
  { id: 'grok-imagine/image-to-video', name: 'Grok Imagine I2V', provider: 'xAI', category: 'image-to-video', supportsImageUpload: true, params: grokImageToVideoParams },
  { id: 'bytedance/v1-lite-image-to-video', name: 'Seedance V1 Lite I2V', provider: 'Bytedance', category: 'image-to-video', supportsImageUpload: true, params: bytedanceV1Params },
  { id: 'bytedance/v1-pro-image-to-video', name: 'Seedance V1 Pro I2V', provider: 'Bytedance', category: 'image-to-video', supportsImageUpload: true, params: bytedanceV1Params },
  { id: 'bytedance/seedance-1.5-pro', name: 'Seedance 1.5 Pro I2V', provider: 'Bytedance', category: 'image-to-video', supportsImageUpload: true, params: seedance15Params },
  { id: 'bytedance/seedance-2', name: 'Seedance 2.0 I2V', provider: 'Bytedance', category: 'image-to-video', supportsImageUpload: true, params: seedance2Params },
  { id: 'veo-3.1', name: 'Veo 3.1 I2V', provider: 'Google', category: 'image-to-video', supportsImageUpload: true, params: veo31Params },
  { id: 'kling-3.0/video', name: 'Kling 3.0 I2V', provider: 'Kuaishou', category: 'image-to-video', supportsImageUpload: true, params: kling30Params },
  { id: 'kling/2-6-image-to-video', name: 'Kling 2.6 I2V', provider: 'Kuaishou', category: 'image-to-video', supportsImageUpload: true, imageInputKey: 'image_urls', imageInputMode: 'array', params: kling25Params },
  { id: 'kling/2-5-turbo-image-to-video-pro', name: 'Kling 2.5 Turbo Pro I2V', provider: 'Kuaishou', category: 'image-to-video', supportsImageUpload: true, imageInputKey: 'image_urls', imageInputMode: 'array', params: kling25Params },
  { id: 'kling/2-1-master-image-to-video', name: 'Kling 2.1 Master I2V', provider: 'Kuaishou', category: 'image-to-video', supportsImageUpload: true, imageInputKey: 'image_urls', imageInputMode: 'array', params: kling21Params },
  { id: 'hailuo/02-image-to-video-pro', name: 'Hailuo Pro I2V', provider: 'Minimax', category: 'image-to-video', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: hailuo23Params },
  { id: 'hailuo/02-image-to-video-standard', name: 'Hailuo Standard I2V', provider: 'Minimax', category: 'image-to-video', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: hailuo23Params },
  { id: 'hailuo/2-3-pro-image-to-video', name: 'Hailuo 2.3 Pro I2V', provider: 'Minimax', category: 'image-to-video', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: hailuo23Params },
  { id: 'hailuo/2-3-standard-image-to-video', name: 'Hailuo 2.3 Standard I2V', provider: 'Minimax', category: 'image-to-video', supportsImageUpload: true, imageInputKey: 'image_url', imageInputMode: 'single', params: hailuo23Params },
  { id: 'happyhorse/image-to-video', name: 'HappyHorse I2V', provider: 'HappyHorse', category: 'image-to-video', supportsImageUpload: true, params: happyHorseImageToVideoParams },
  { id: 'happyhorse/reference-to-video', name: 'HappyHorse Reference Video', provider: 'HappyHorse', category: 'image-to-video', supportsImageUpload: true, imageInputKey: 'image_urls', imageInputMode: 'array', params: happyHorseImageToVideoParams },
  { id: 'gemini-omni-video', name: 'Gemini Omni I2V', provider: 'Google', category: 'image-to-video', supportsImageUpload: true, supportsVideoUpload: true, params: geminiOmniVideoParams },

  // Video Models (Video to Video)
  { id: 'wan/2-6-video-to-video', name: 'Wan 2.6 V2V', provider: 'Wan', category: 'video-to-video', supportsVideoUpload: true, params: wanVideoToVideoParams },
  { id: 'wan/2-6-flash-video-to-video', name: 'Wan 2.6 Flash V2V', provider: 'Wan', category: 'video-to-video', supportsVideoUpload: true, videoInputKey: 'video_urls', videoInputMode: 'array', params: wanVideoToVideoParams },
  { id: 'wan/2-7-video-edit', name: 'Wan 2.7 Video Edit', provider: 'Wan', category: 'video-to-video', supportsVideoUpload: true, videoInputKey: 'video_urls', videoInputMode: 'array', params: wanVideoToVideoParams },
  { id: 'grok-imagine/video-upscale', name: 'Grok Video Upscale', provider: 'xAI', category: 'video-to-video', supportsVideoUpload: true, videoInputKey: 'video_url', videoInputMode: 'single', params: topazVideoUpscaleParams },
  { id: 'grok-imagine/video-extend', name: 'Grok Video Extend', provider: 'xAI', category: 'video-to-video', supportsVideoUpload: true, videoInputKey: 'video_url', videoInputMode: 'single', params: grokImageToVideoParams },
  { id: 'topaz/video-upscale', name: 'Topaz Video Upscale', provider: 'Topaz', category: 'video-to-video', supportsVideoUpload: true, videoInputKey: 'video_url', videoInputMode: 'single', params: topazVideoUpscaleParams },
  { id: 'happyhorse/video-edit', name: 'HappyHorse Video Edit', provider: 'HappyHorse', category: 'video-to-video', supportsVideoUpload: true, videoInputKey: 'video_url', videoInputMode: 'single', params: happyHorseVideoParams },
  { id: 'kling-3.0/video', name: 'Kling 3.0 V2V', provider: 'Kuaishou', category: 'video-to-video', supportsVideoUpload: true, params: kling30Params },
  { id: 'gemini-omni-video', name: 'Gemini Omni V2V', provider: 'Google', category: 'video-to-video', supportsImageUpload: true, supportsVideoUpload: true, params: geminiOmniVideoParams },
];

export interface GenerationLog {
  id: string;
  timestamp: string;
  modelId: string;
  modelName: string;
  provider: string;
  prompt: string;
  status: 'generating' | 'success' | 'failed';
  taskId?: string;
  completedAt?: string;
  durationMs?: number;
  mediaUrl?: string; // Result URL (first image/video)
  mediaUrls?: string[]; // Array of result URLs (some models return multiple images)
  error?: string;
  type: 'image' | 'video' | 'text';
}
