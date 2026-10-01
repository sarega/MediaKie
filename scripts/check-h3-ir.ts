import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import express from 'express';
import {installH3Enhancer} from '../providers/h3-ir';

const listen = async (app: express.Express) => {
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  return server;
};
const base = (server: ReturnType<express.Express['listen']>) => `http://127.0.0.1:${(server.address() as {port:number}).port}`;
const fixture=Buffer.from('reference-image');
const digest=createHash('sha256').update(fixture).digest('hex');
let compiledBody:any;
const compiler=express();
compiler.use(express.raw({type:'application/octet-stream',limit:'1mb'}));
compiler.use(express.json());
compiler.get('/health',(_req,res)=>res.json({ok:true}));
compiler.put('/v1/assets/:sha',(req,res)=>{assert.equal(req.params.sha,digest);assert.deepEqual(req.body,fixture);res.status(201).json({ok:true});});
compiler.post('/v1/briefs',(req,res)=>{compiledBody=req.body;res.status(201).json({id:'pair-1',status:'ready',presentation:{},plan:{shots:[{n:1,from:0,to:6,what_happens:'moves',camera:'dolly'}]},ir:{prompt:'[compiled H3 prompt]',diagnostics:[],target:{nominal_seconds:6}}});});
const compilerServer=await listen(compiler);
process.env.H3_IR_URL=base(compilerServer);
const studio=express();studio.use(express.json({limit:'1mb'}));installH3Enhancer(studio);
const studioServer=await listen(studio);
try{
  const response=await fetch(`${base(studioServer)}/api/h3-ir/compile`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intent:'a dancer turns',seconds:6,aspect:'16:9',creativity:'balanced',assets:[{kind:'image',role:'frame_anchor_first',dataUrl:`data:image/png;base64,${fixture.toString('base64')}`}]})});
  assert.equal(response.status,200);assert.equal((await response.json()).prompt,'[compiled H3 prompt]');
  assert.equal(compiledBody.assets[0].sha256,digest);assert.equal(compiledBody.assets[0].role,'frame_anchor_first');assert.equal(compiledBody.intent,'a dancer turns');
  console.log('H3 prompt compiler proxy: upload, compile and normalized response passed.');
}finally{
  await Promise.all([new Promise<void>(resolve=>studioServer.close(()=>resolve())),new Promise<void>(resolve=>compilerServer.close(()=>resolve()))]);
}
