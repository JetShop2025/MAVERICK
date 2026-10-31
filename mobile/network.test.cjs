const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');
const assert = require('node:assert/strict');
const code = ts.transpileModule(fs.readFileSync('network.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function run(name, fake, check) {
  let calls=0;
  const context={exports:{},AbortController,setTimeout,clearTimeout,fetch:async(...args)=>{calls++;return fake(calls,...args)}};
  vm.runInNewContext(code,context);
  await check(context.exports,()=>calls);
  console.log('PASS '+name);
}
const good=()=>({status:200,text:async()=>'{"ok":true}'});
(async()=>{
await run('transient read retries and recovers', n=>{if(n===1)throw Error('lost');return good()},async(api,count)=>{const r=await api.requestJson('test',{}, {retryDelayMs:0});assert.equal(r.payload.ok,true);assert.equal(count(),2)});
await run('persistent outage becomes friendly error',()=>{throw Error('Promise.swift:56')},async(api,count)=>{await assert.rejects(api.requestJson('test',{}, {retryDelayMs:0}),e=>e.name==='ConnectionError'&&!e.message.includes('swift'));assert.equal(count(),2)});
await run('writes never retry',()=>{throw Error('lost')},async(api,count)=>{await assert.rejects(api.requestJson('test',{method:'POST'}));assert.equal(count(),1)});
await run('401 is returned without retry',()=>({status:401,text:async()=>'{"ok":false}'}),async(api,count)=>{const r=await api.requestJson('test');assert.equal(r.response.status,401);assert.equal(count(),1)});
await run('temporary gateway error retries',n=>n===1?{status:503,text:async()=>''}:good(),async(api,count)=>{await api.requestJson('test',{}, {retryDelayMs:0});assert.equal(count(),2)});
await run('body connection failure retries',n=>n===1?{status:200,text:async()=>{throw Error('lost')}}:good(),async(api,count)=>{await api.requestJson('test',{}, {retryDelayMs:0});assert.equal(count(),2)});
await run('timeout bounds stalled requests',(_n,_u,o)=>new Promise((_resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('aborted')))),async(api,count)=>{await assert.rejects(api.requestJson('test',{}, {timeoutMs:5,retryDelayMs:0}));assert.equal(count(),2)});
await run('caller cancellation is not retried',(_n,_u,o)=>{if(o.signal.aborted)throw Error('cancelled');return good()},async(api,count)=>{const c=new AbortController();c.abort();await assert.rejects(api.requestJson('test',{signal:c.signal}));assert.equal(count(),1)});
})().catch(e=>{console.error(e);process.exitCode=1});
