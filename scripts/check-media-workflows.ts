import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {MODEL_REGISTRY} from '../src/models/registry';
import {primaryWorkflow,supportsWorkflow,firstImageParameter} from '../src/models/workflows';
import {thumbnailUrl} from '../src/components/MediaThumbnail';
import {createThumbnailer} from '../providers/thumbnails';
import {prepareKieInput} from '../providers/kie-input';
const get=(id:string)=>MODEL_REGISTRY.find(m=>m.id===id)!;
assert.equal(primaryWorkflow(get('veo/extend')),'extend');
assert.equal(supportsWorkflow(get('veo/extend'),'text-to-video'),false);
assert.equal(supportsWorkflow(get('pixverse-v6/transition'),'frames'),true);
assert.equal(supportsWorkflow(get('minimax-h3/reference-to-video'),'reference'),true);
assert.equal(supportsWorkflow(get('kling/2-5-turbo-image-to-video-pro'),'image-to-video'),true);
const reference=get('minimax-h3/reference-to-video');
assert.equal(firstImageParameter(reference,'reference')?.key,'reference_image_urls');
const frames=get('minimax-h3/image-to-video');
assert.equal(firstImageParameter(frames,'frames')?.key,'first_frame_url');
assert.doesNotThrow(()=>prepareKieInput(frames,{prompt:'test',first_frame_url:'https://example.com/source.png'}));
assert.equal(thumbnailUrl('/library/a.mp4','video'),'/api/media/thumbnail?url=%2Flibrary%2Fa.mp4');
assert.equal(thumbnailUrl('https://example.com/a.mp4','video'),null);
assert.equal(thumbnailUrl('/library/a.png','image'),null);
const run=promisify(execFile);
const binary=process.env.FFMPEG_PATH||await fs.access('/opt/homebrew/bin/ffmpeg').then(()=>'/opt/homebrew/bin/ffmpeg').catch(()=>'ffmpeg');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'studio-thumbnails-'));
try{
 try{await run(binary,['-version']);}catch{console.log('Workflow checks passed; ffmpeg thumbnail integration skipped (binary unavailable).');process.exitCode=0;}
 if(process.exitCode!==0){
 const video=path.join(directory,'fixture.mp4');
 await run(binary,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=violet:s=320x180:d=1','-pix_fmt','yuv420p',video]);
 const thumbnail=createThumbnailer(path.join(directory,'cache'));
 const [first,second]=await Promise.all([thumbnail(video),thumbnail(video)]);
 assert.equal(first,second);const image=await fs.readFile(first);assert.equal(image[0],0xff);assert.equal(image[1],0xd8);assert.ok(image.length>100);
 const time=(await fs.stat(first)).mtimeMs;await thumbnail(video);assert.equal((await fs.stat(first)).mtimeMs,time,'Cached thumbnail must be reused');
 await assert.rejects(()=>thumbnail(path.join(directory,'missing.mp4')));
 console.log('Workflow filters, reference mapping, real video thumbnail extraction and cache checks passed.');
 }
}finally{await fs.rm(directory,{recursive:true,force:true});}
