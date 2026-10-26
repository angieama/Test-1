import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({
  configFile:false,root,publicDir:false,plugins:[react()],
  resolve:{alias:{'@':root}},
  define:{'process.env.NODE_ENV':JSON.stringify('production')},
  build:{write:false,minify:true,cssCodeSplit:false,assetsInlineLimit:10000000,
    lib:{entry:new URL('../static/entry.tsx',import.meta.url).pathname,name:'LipaVerify',formats:['iife'],fileName:()=> 'lipa.js'},
  },
});
const outputs=(Array.isArray(result)?result:[result]).flatMap(r=>r.output);
const script=outputs.find(o=>o.type==='chunk').code;
const css=outputs.filter(o=>o.type==='asset'&&o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
const favicon=await readFile(new URL('../public/favicon.svg',import.meta.url),'utf8');
const html=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#167447"><meta name="description" content="LipaVerify browser demo: payments, journeys, cash, refunds and earnings."><meta name="apple-mobile-web-app-capable" content="yes"><title>LipaVerify · Payments & rides</title><link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}"><link rel="manifest" href="./manifest.webmanifest"><link rel="apple-touch-icon" href="./public/icons/apple-touch-icon.png"><style>${String(css).replaceAll('</style','<\\/style')}</style></head><body><div id="root"></div><noscript>Please enable JavaScript to use LipaVerify.</noscript><script>${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>\n`;
await writeFile(new URL('../index.html',import.meta.url),html);
const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
manifest.id='./';manifest.start_url='./';manifest.scope='./';manifest.description='Browser-only payment and ride simulator. Records stay on this device.';
manifest.icons=manifest.icons.map(i=>({...i,src:'./public'+i.src}));
await writeFile(new URL('../manifest.webmanifest',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
const version=createHash('sha256').update(html).digest('hex').slice(0,12);
await writeFile(new URL('../sw.js',import.meta.url),`/* Browser demo only. Network-first HTML, local records remain in localStorage. */
const CACHE='lipa-verify-html-${version}';
const ROOT=new URL('./',self.location.href).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.add(new Request(new URL('index.html',ROOT),{cache:'reload'}));await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith('lipa-verify-html-')&&key!==CACHE)await caches.delete(key);}await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET'||request.mode!=='navigate')return;const url=new URL(request.url);if(url.origin!==self.location.origin||!url.href.startsWith(ROOT))return;event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(new URL('index.html',ROOT),response.clone());}return response;}catch{const cache=await caches.open(CACHE);return await cache.match(new URL('index.html',ROOT))||new Response('Open the app online once before using it offline.',{status:503});}})());});
`);
await writeFile(new URL('../.nojekyll',import.meta.url),'');
console.log(`Created index.html (${html.length.toLocaleString()} characters). All application JS and CSS are inline.`);
