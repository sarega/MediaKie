import assert from 'node:assert/strict';
import { estimateModelCredits, SUPPORTED_MODELS } from '../src/types';

const model = (id: string, category: 'text-to-video' | 'image-to-video' | 'video-to-video' | 'text-to-image' | 'image-to-image') => {
  const found = SUPPORTED_MODELS.find((item) => item.id === id && item.category === category);
  assert.ok(found, `Missing ${id} (${category})`);
  return found;
};

assert.equal(estimateModelCredits(model('google/gemini-omni-flash-1-1', 'text-to-video'), { resolution: '1080p', duration: '10' }), 126);
assert.equal(estimateModelCredits(model('google/gemini-omni-flash-1-1', 'video-to-video'), { resolution: '4k', duration: '4' }, 'video'), 252);
assert.equal(estimateModelCredits(model('wan/3-0-video', 'video-to-video'), { resolution: '720p', duration: 5 }, 'video', 10), 240);
assert.equal(estimateModelCredits(model('kling-3.0-omni/text-to-video', 'text-to-video'), { resolution: '1080p', audio: true, duration: 5 }), 115);
assert.equal(estimateModelCredits(model('minimax-h3/text-to-video', 'text-to-video'), { resolution: '768P', duration: 15 }), 120);
assert.equal(estimateModelCredits(model('minimax-h3/text-to-video', 'text-to-video'), { resolution: '2K', duration: 15 }), 195);
assert.equal(estimateModelCredits(model('minimax-h3/reference-to-video', 'image-to-video'), { resolution: '768P', duration: 15, reference_video_urls: ['https://example.com/source.mp4'] }, 'video', 10), 200);
assert.equal(estimateModelCredits(model('grok-imagine-image-2-0', 'text-to-image'), {}), 4);
assert.equal(estimateModelCredits(model('nano-banana-2-lite', 'text-to-image'), {}), 4);
assert.equal(estimateModelCredits(model('qwen3/pro-image-to-image', 'image-to-image'), { resolution: '2K', image_urls: ['a', 'b'] }), 13);
assert.equal(estimateModelCredits(model('hailuo/02-image-to-video-standard', 'image-to-video'), { resolution: '512P', duration: '10' }), 20);
assert.equal(estimateModelCredits(model('hailuo/2-3-pro-image-to-video', 'image-to-video'), { resolution: '1080P', duration: '6' }), 80);
assert.equal(estimateModelCredits(model('kling/2-1-master-text-to-video', 'text-to-video'), { duration: '5' }), 160);
assert.equal(estimateModelCredits(model('kling/2-5-turbo-image-to-video-pro', 'image-to-video'), { duration: '10' }), 84);
assert.equal(estimateModelCredits(model('wan/2-6-text-to-video', 'text-to-video'), { resolution: '1080p', duration: '5' }), 105);
assert.equal(estimateModelCredits(model('wan/2-7-image', 'text-to-image'), { n: 1 }), 5);
assert.equal(estimateModelCredits(model('wan/2-7-image-pro', 'text-to-image'), { n: 2 }), 24);
assert.equal(estimateModelCredits(model('qwen3/text-to-image', 'text-to-image'), { resolution: '2K' }), 5);
assert.equal(estimateModelCredits(model('gpt-image/1.5-text-to-image', 'text-to-image'), { quality: 'high' }), 22);
assert.equal(estimateModelCredits(model('bytedance/seedream', 'text-to-image'), {}), 4);

console.log('Credit estimate checks passed.');
