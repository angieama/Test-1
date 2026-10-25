import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('public/manifest.webmanifest',root),'utf8'));
const sw=readFileSync(new URL('public/sw.js',root),'utf8');
const origin='https://example.test';
function worker(fetchImpl){
 const handlers={};let claimed=false;
 const self={location:{origin},clients:{claim:async()=>{claimed=true;}},skipWaiting:()=>{},addEventListener:(name,fn)=>handlers[name]=fn};
 vm.runInNewContext(sw,{self,URL,Response,fetch:fetchImpl});
 return {handlers,isClaimed:()=>claimed};
}
test('manifest has standalone launch, same-origin scope and valid icon dimensions',()=>{
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
 for(const size of [192,512]){
  const icon=manifest.icons.find(i=>i.sizes===`${size}x${size}`&&i.purpose==='any');assert.ok(icon);
  const bytes=readFileSync(new URL('public'+icon.src,root));
  assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
 }
 assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
 assert.ok(existsSync(new URL('public/icons/apple-touch-icon.png',root)));
});
test('service worker never intercepts payment API requests or mutations',()=>{
 const w=worker(()=>{throw Error('must not fetch');});
 for(const request of [{method:'POST',mode:'cors',url:origin+'/api/claim'},{method:'GET',mode:'cors',url:origin+'/api/transactions'}]){
  let intercepted=false;w.handlers.fetch({request,respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
 }
});
test('offline navigation returns a truthful fallback instead of stored payment records',async()=>{
 const w=worker(async()=>{throw TypeError('offline');});let result;
 w.handlers.fetch({request:{method:'GET',mode:'navigate',url:origin+'/'},respondWith:p=>result=p});
 const response=await result;assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.text();assert.match(body,/You’re offline/);assert.match(body,/No confirmations can be made offline/);
 assert.doesNotMatch(body,/DEMO000|Faith|Wanjiku/);
});
test('authentication failures pass through, rather than being hidden by offline UI',async()=>{
 const w=worker(async()=>new Response('Sign in required',{status:401}));let result;
 w.handlers.fetch({request:{method:'GET',mode:'navigate',url:origin+'/'},respondWith:p=>result=p});
 const response=await result;assert.equal(response.status,401);assert.equal(await response.text(),'Sign in required');
});
test('service worker takes control without waiting for the next browser session',async()=>{
 const w=worker(async()=>new Response('ok'));let activate;
 w.handlers.activate({waitUntil:p=>activate=p});await activate;assert.equal(w.isClaimed(),true);
});
