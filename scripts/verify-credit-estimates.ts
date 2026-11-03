import {readFileSync} from 'node:fs';
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
assert.equal(estimateModelCredits(model('wan/2-7-image', 'text-to-image'), { n: 1 }), 4.8);
assert.equal(estimateModelCredits(model('wan/2-7-image-pro', 'text-to-image'), { n: 2 }), 24);
assert.equal(estimateModelCredits(model('qwen3/text-to-image', 'text-to-image'), { resolution: '2K' }), 4.8);
assert.equal(estimateModelCredits(model('gpt-image/1.5-text-to-image', 'text-to-image'), { quality: 'high' }), 22);
assert.equal(estimateModelCredits(model('bytedance/seedream', 'text-to-image'), {}), 3.5);

const snapshot = JSON.parse(readFileSync(new URL('./fixtures/kie-pricing-2026-10-24.json',import.meta.url),'utf8'));
for (const item of snapshot.cases) {
  const found = SUPPORTED_MODELS.find(m=>m.id===item.model && m.category===item.category);
  assert.ok(found, `Missing pricing fixture model ${item.model}:${item.category}`);
  const defaults = Object.fromEntries((found.params||[]).map(p=>[p.key,p.defaultValue]));
  assert.equal(estimateModelCredits(found,{...defaults,...item.params},item.sourceType,item.sourceDuration),item.credits,item.sourceDescription);
}
const seedance=model('bytedance/seedance-2-5','text-to-video');
assert.equal(estimateModelCredits(seedance,{duration:-1,resolution:'720p'}),null,'Auto duration must not produce a made-up quote');
assert.equal(estimateModelCredits(seedance,{duration:5,resolution:'720p',reference_video_urls:['https://example.com/input.mp4']}),null,'Source duration is required for input+output billing');
assert.equal(estimateModelCredits(model('grok-imagine-video-1-5-preview','image-to-video'),{duration:5,resolution:'1080p'}),null,'Unpublished Preview price must remain unknown');
const eleven=SUPPORTED_MODELS.find(m=>m.id==='elevenlabs/text-to-speech-turbo-2-5')!;
assert.equal(estimateModelCredits(eleven,{prompt:'ก'.repeat(1000)}),6);
assert.equal(estimateModelCredits(eleven,{prompt:'Hello'}),0.03);
console.log(`Credit estimates passed, including ${snapshot.cases.length} public-price fixtures (${snapshot.verifiedAt}).`);
