import assert from 'node:assert/strict';
import {MODEL_REGISTRY, defaultsFor, type RegistryModel} from '../src/models/registry';
import {prepareKieInput} from '../providers/kie-input';
import {kieAdapter} from '../providers/kie';
const model=(id:string,category?:string)=>{
  const found=MODEL_REGISTRY.find(m=>m.id===id&&(!category||m.category===category));
  assert.ok(found,id);return found;
};
const prepare=(m:RegistryModel,input:Record<string,unknown>)=>prepareKieInput(m,{...defaultsFor(m),...input});
const image='https://example.com/input.png',video='https://example.com/input.mp4';
const aliases:Record<string,string>={
  'kling/2-6-text-to-video':'kling-2.6/text-to-video',
  'kling/2-5-turbo-image-to-video-pro':'kling/v2-5-turbo-image-to-video-pro',
  'kling/2-1-master-image-to-video':'kling/v2-1-master-image-to-video',
  'hailuo/2-3-pro-image-to-video':'hailuo/2-3-image-to-video-pro',
  'wan/2-7-video-edit':'wan/2-7-videoedit',
  'volcengine-video-to-video-lip-sync':'volcengine/video-to-video-lip-sync',
};
for(const [local,remote] of Object.entries(aliases))assert.equal(model(local).mappings[0].modelId,remote);
assert.equal(model('grok-imagine-image-2-0','text-to-image').mappings[0].modelId,'grok-imagine-image-2-0/text-to-image');
assert.equal(model('grok-imagine-image-2-0','image-to-image').mappings[0].modelId,'grok-imagine-image-2-0/image-edit');
assert.ok(model('kling/2-1-pro').unavailableReason,'Unsupported T2V must not be sent to an image-only endpoint');
const kling=prepare(model('kling/2-5-turbo-image-to-video-pro'),{prompt:'test',__sourceImage:image});
assert.equal(kling.image_url,image);assert.equal(kling.image_urls,undefined);
assert.equal(kling.mode,undefined);assert.equal(kling.aspect_ratio,undefined);
const kling26=prepare(model('kling/2-6-image-to-video'),{prompt:'test',__sourceImage:image});
assert.deepEqual(kling26.image_urls,[image]);
assert.deepEqual(prepare(model('kling/2-6-image-to-video'),{prompt:'test',image_url:image}).image_urls,[image]);assert.equal(kling26.image_url,undefined);assert.equal(kling26.aspect_ratio,undefined);
assert.equal(prepare(model('hailuo/2-3-pro-image-to-video'),{prompt:'test',__sourceImage:image}).image_url,image);
assert.equal(prepare(model('happyhorse/video-edit'),{prompt:'edit',__sourceVideo:video,duration:5}).duration,undefined);
const wanEdit=prepare(model('wan/2-7-video-edit'),{prompt:'test',video_urls:[video],duration:'5'});
assert.equal(wanEdit.video_url,video);assert.equal(wanEdit.duration,5);
assert.equal(prepare(model('grok-imagine/text-to-video'),{prompt:'test',duration:'6'}).duration,6);
const seedance=model('bytedance/seedance-2-5');
assert.throws(()=>prepare(seedance,{prompt:'test',first_frame_url:image,reference_video_urls:[video]}),/cannot be combined/);
assert.throws(()=>prepare(seedance,{prompt:'test',duration:3}),/4–30/);
assert.equal(prepare(seedance,{prompt:'test',duration:-1}).duration,-1);
assert.throws(()=>prepare(model('gpt-image-2-text-to-image'),{prompt:'test',background:'transparent',resolution:'2K'}),/1K/);
const upscale=model('grok-imagine/video-upscale');
assert.throws(()=>prepare(upscale,{__sourceVideo:video}),/task ID/);
assert.equal(prepare(upscale,{task_id:'old-task'}).task_id,'old-task');
const extended=prepare(model('grok-imagine/video-extend'),{prompt:'test',task_id:'old-task',extend_times:'10',extend_at:2});
assert.equal(extended.extend_times,'10');assert.equal(extended.resolution,undefined);
assert.throws(()=>prepare(model('grok-imagine/video-extend'),{prompt:'test',task_id:'old-task',extend_at:1}),/at least 2/);
const veo=model('veo-3.1','image-to-video');
const input=prepare(veo,{prompt:'test',__sourceImage:image,duration:'8',aspectRatio:'auto',callBackUrl:'https://example.com/callback'});
assert.deepEqual(input.image_urls,[image]);assert.equal(input.generation_type,'FIRST_AND_LAST_FRAMES_2_VIDEO');
assert.equal(input.aspect_ratio,'Auto');assert.equal(input.duration,8);assert.equal(input.seeds,undefined);assert.equal(input.generationType,undefined);
assert.throws(()=>prepare(veo,{prompt:'test',generationType:'REFERENCE_2_VIDEO',duration:6,veo_reference_image_urls:[image]}),/8 seconds/);
assert.throws(()=>prepare(veo,{prompt:'test',model:'veo3',generationType:'REFERENCE_2_VIDEO',duration:8,veo_reference_image_urls:[image]}),/Fast or Lite/);
assert.equal(prepare(model('veo/extend'),{prompt:'continue',taskId:'old-task'}).task_id,'old-task');
assert.equal(prepare(model('veo/get-4k-video'),{taskId:'old-task'}).task_id,'old-task');
assert.equal(prepare(model('veo/get-1080p-video'),{taskId:'old-task'}).taskId,'old-task');
const originalFetch=globalThis.fetch;
const calls:{url:string;body:any}[]=[];
let response:any={code:200,data:{taskId:'new-task'}};
globalThis.fetch=async(url,options)=>{
  assert.ok(String(url).startsWith('https://api.kie.ai/api/v1/'),'Only mocked Kie calls are allowed');
  calls.push({url:String(url),body:options?.body?JSON.parse(String(options.body)):undefined});
  return new Response(JSON.stringify(response));
};
const adapter=kieAdapter(()=>'fixture');
try {
  await adapter.submit(veo.mappings[0],input);
  assert.equal(calls.at(-1)!.url,'https://api.kie.ai/api/v1/jobs/createTask');
  assert.equal(calls.at(-1)!.body.model,'veo-3-1');
  assert.equal(calls.at(-1)!.body.callBackUrl,'https://example.com/callback');
  assert.equal(calls.at(-1)!.body.input.callBackUrl,undefined);
  assert.equal(calls.at(-1)!.body.input.duration,8);
  const extension=model('veo/extend');
  await adapter.submit(extension.mappings[0],prepare(extension,{prompt:'continue',taskId:'old-task'}));
  assert.equal(calls.at(-1)!.url,'https://api.kie.ai/api/v1/jobs/createTask');
  assert.equal(calls.at(-1)!.body.input.task_id,'old-task');
  // A saved mapping without apiVersion still belongs to the legacy Veo API.
  await adapter.submit({provider:'kie',modelId:'veo-3.1'},{prompt:'old payload',imageUrls:[image]});
  assert.equal(calls.at(-1)!.url,'https://api.kie.ai/api/v1/veo/generate');
  assert.deepEqual(calls.at(-1)!.body.imageUrls,[image]);
  response={code:200,data:{successFlag:1,response:{resultUrls:[video]}}};
  assert.equal((await adapter.poll({taskId:'legacy-task',status:'running',outputs:[]},{provider:'kie',modelId:'veo-3.1'})).status,'completed');
  assert.match(calls.at(-1)!.url,/veo\/record-info/);
  response={code:200,data:{state:'success',creditsConsumed:180,resultJson:JSON.stringify({data:{result_urls:[video],origin_urls:['https://example.com/720-preview.mp4']}})}};
  const job={taskId:'market-task',status:'running' as const,outputs:[],settings:{resolution:'4k'}};
  const completed=await adapter.poll(job,veo.mappings[0]);
  assert.match(calls.at(-1)!.url,/jobs\/recordInfo/);assert.deepEqual(completed.outputs,[video]);
  assert.equal(completed.finalCost?.credits,180);assert.equal(completed.finalCost?.kind,'final');
  response.data.resultJson=JSON.stringify({data:{result_urls:[],origin_urls:[video]}});
  assert.equal((await adapter.poll(job,veo.mappings[0])).status,'running','Do not complete a paid HD job with its 720p preview');
  response={code:200,data:{resultUrl:video}};
  const direct=await adapter.submit(model('veo/get-1080p-video').mappings[0],{taskId:'old-task'});
  assert.equal(direct.status,'completed');assert.deepEqual(direct.outputs,[video]);
} finally {globalThis.fetch=originalFetch;}
console.log('Kie API migration: wire IDs, validation, callbacks, legacy job recovery, HD outputs and reported charges passed (mocked; no paid calls).');

// Kling 4.0 public contract and billing, verified 2026-11-03.
const k4text=model('kling-4.0/keyframe-to-video','text-to-video');
const k4frames=model('kling-4.0/keyframe-to-video','image-to-video');
const k4ref=model('kling-4.0/reference-to-video');
assert.equal(k4ref.mappings[0].modelId,'kling-4.0/reference-to-video');
assert.equal(prepare(k4text,{prompt:'A landscape',duration:'30'}).duration,30);
assert.equal(prepare(k4frames,{prompt:'@first_frame to @last_frame',__sourceImage:image,last_frame_url:image}).first_frame_url,image);
assert.deepEqual(prepare(k4ref,{prompt:'@image_1 in @video_1',__sourceImage:image,__sourceVideo:video}).video_urls,[video]);
assert.throws(()=>prepare(k4text,{prompt:'test',duration:31}),/3–30/);
assert.throws(()=>prepare(k4text,{prompt:'test',resolution:'4k'}),/720p or 1080p/);
assert.throws(()=>prepare(k4ref,{prompt:'@image_2',image_urls:[image]}),/undeclared/);
assert.throws(()=>prepare(k4ref,{prompt:'test',image_urls:Array(11).fill(image)}),/10/);
assert.throws(()=>prepare(k4frames,{prompt:'test',last_frame_url:image}),/first frame/);
assert.throws(()=>prepare(k4frames,{prompt:'test',duration:3,first_frame_url:image,keyframe_urls:Array(4).fill(image)}),/frame count/);
assert.equal(prepare(k4text,{prompt:'test',sound:false}).sound,undefined);
const {estimateModelCredits: k4credits}=await import('../src/types');
for(const [resolution,normal,withVideo] of [['720p',28.5,17],['1080p',42.5,25.5]] as const) {
  assert.equal(k4credits(k4text,{duration:10,resolution}),10*normal);
  assert.equal(k4credits(k4ref,{duration:10,resolution,video_urls:[video]}),null);
  assert.equal(k4credits(k4ref,{duration:10,resolution},'video',5),20*withVideo);
  assert.equal(k4credits(k4ref,{duration:10,resolution},'video',15),25*withVideo);
}
console.log('Kling 4.0 request and pricing checks passed.');
