import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const origin='https://lipa.example';
const html='<html><meta name="lipa-app" content="demo"/><div id="root"></div></html>';
const response=()=>new Response(html,{headers:{'content-type':'text/html'}});
function worker(fetcher=async()=>response()) {
 const events={}, saved=new Map();
 const cache={put:async(key,value)=>saved.set(key,value),match:async key=>saved.get(key)?.clone()};
 const caches={open:async()=>cache,match:async key=>saved.get(key)?.clone(),keys:async()=>[],delete:async()=>true};
 class BrowserRequest extends Request {constructor(input,options){super(new URL(input,origin),options);}}
 const context={self:{location:{origin},clients:{claim:async()=>{}},addEventListener:(type,fn)=>events[type]=fn},caches,fetch:fetcher,Request:BrowserRequest,Response,URL,Set};
 const source=readFileSync(new URL('../scripts/service-worker.template.js',import.meta.url),'utf8').replace('__CACHE_VERSION__','test').replace('__PRECACHE__',JSON.stringify(['/','/assets/app.js']));
 vm.runInNewContext(source,context);
 return {events,saved,fetch:async request=>{let result;events.fetch({request,respondWith:promise=>result=promise});return result;}};
}
test('offline shell is served only for root navigation, never APIs, auth, queries or foreign origins',async()=>{
 const w=worker(async()=>{throw new Error('offline');});w.saved.set('/',response());
 const result=await w.fetch({url:origin+'/',method:'GET',mode:'navigate'});assert.equal(await result.text(),html);
 for(const request of [
  {url:origin+'/api/transactions',method:'GET',mode:'cors'},
  {url:origin+'/login',method:'GET',mode:'navigate'},
  {url:origin+'/?token=example',method:'GET',mode:'navigate'},
  {url:'https://other.example/',method:'GET',mode:'navigate'},
  {url:origin+'/',method:'POST',mode:'navigate'}
 ])assert.equal(await w.fetch(request),undefined);
});
test('network auth failures pass through and cannot replace the cached demo',async()=>{
 const w=worker(async()=>new Response('Sign in',{status:401}));w.saved.set('/',response());
 const result=await w.fetch({url:origin+'/',method:'GET',mode:'navigate'});
 assert.equal(result.status,401);assert.equal(await w.saved.get('/').clone().text(),html);
});
test('precache rejects a login page instead of retaining it as an offline shell',async()=>{
 const w=worker(async()=>new Response('<html>Login</html>',{headers:{'content-type':'text/html'}}));
 let install;w.events.install({waitUntil:promise=>install=promise});
 await assert.rejects(install,/could not be cached/);assert.equal(w.saved.has('/'),false);
});
test('first offline visit without cached files asks for a connection',async()=>{
 const w=worker(async()=>{throw new Error('offline');});
 const result=await w.fetch({url:origin+'/',method:'GET',mode:'navigate'});
 assert.equal(result.status,503);assert.match(await result.text(),/first time/);
});
test('installation precaches the canonical root and bundled assets',async()=>{
 const fetched=[];
 const w=worker(async request=>{const path=new URL(request.url).pathname;fetched.push(path);return path==='/'?response():new Response('console.log("demo")',{headers:{'content-type':'application/javascript'}});});
 let install;w.events.install({waitUntil:promise=>install=promise});await install;
 assert.deepEqual(fetched,['/','/assets/app.js']);assert.equal(w.saved.has('/'),true);assert.equal(w.saved.has('/assets/app.js'),true);
});
