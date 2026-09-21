import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export function createThumbnailer(cacheDirectory:string) {
 const pending=new Map<string,Promise<string>>();
 let queue=Promise.resolve();
 return async (source:string) => {
  const stat=await fs.stat(source);
  if(!stat.isFile() || !/\.(mp4|mov|webm)$/i.test(source))throw new Error('Unsupported local video');
  const key=createHash('sha256').update(`${source}:${stat.size}:${stat.mtimeMs}`).digest('hex');
  const target=path.join(cacheDirectory,`${key}.jpg`);
  if(pending.has(key))return pending.get(key)!;
  try {await fs.access(target);return target;} catch {}
  const operation=queue.then(async()=>{
   await fs.mkdir(cacheDirectory,{recursive:true});
   const binary=process.env.FFMPEG_PATH || (await fs.access('/opt/homebrew/bin/ffmpeg').then(()=>'/opt/homebrew/bin/ffmpeg').catch(()=>'ffmpeg'));
   // Read only a resolved local file. Never pass a remote URL to ffmpeg.
   await run(binary,['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-ss','0.1','-i',source,'-frames:v','1','-vf','thumbnail=30,scale=480:-2','-q:v','4','-y',target],{timeout:20000,maxBuffer:512*1024});
   await fs.access(target);return target;
  });
  queue=operation.then(()=>{},()=>{});pending.set(key,operation);
  try{return await operation;}catch(error){await fs.unlink(target).catch(()=>{});throw error;}finally{pending.delete(key);}
 };
}
