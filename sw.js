// Optional offline shell for the standalone demo webpage. No payment APIs are cached.
const BASE = new URL('./', self.location.href);
const ROOT = BASE.pathname;
const CACHE = 'lipa-plain-140fbe2f8d7b-' + ROOT;
const ASSETS = ['manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'].map(path => new URL(path, BASE).href);
async function valid(response) {return response.ok && !response.redirected && (response.headers.get('content-type')||'').includes('text/html') && (await response.clone().text()).includes('name="lipa-app" content="demo"');}
self.addEventListener('install', event => event.waitUntil((async () => {
 const cache = await caches.open(CACHE);
 const response = await fetch(new Request(BASE.href, {cache:'reload',credentials:'same-origin',redirect:'error'}));
 if (!(await valid(response))) throw new Error('Demo webpage is unavailable');
 await cache.put(BASE.href,response);
 await cache.addAll(ASSETS);
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
 const keys=await caches.keys();
 await Promise.all(keys.filter(key => ((key.startsWith('lipa-plain-') && key.endsWith('-'+ROOT)) || (ROOT==='/' && key.startsWith('lipa-demo-shell-'))) && key!==CACHE).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
 const r=event.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==BASE.origin||u.search)return;
 if(r.mode==='navigate'&&(u.pathname===ROOT||u.pathname===ROOT+'index.html')){
  event.respondWith((async()=>{try{const response=await fetch(r);if(await valid(response)){const cache=await caches.open(CACHE);await cache.put(BASE.href,response.clone());}return response;}catch{return (await caches.match(BASE.href,{cacheName:CACHE}))||new Response('Connect to the internet to open LipaVerify for the first time.',{status:503});}})());
 }else if(ASSETS.includes(u.href))event.respondWith(caches.match(u.href,{cacheName:CACHE}).then(cached=>cached||fetch(r)));
});
