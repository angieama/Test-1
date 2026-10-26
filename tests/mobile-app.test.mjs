import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url)));
assert.equal(manifest.display, "standalone");
assert.equal(manifest.scope, "/");
assert.equal(manifest.id, "/");
assert.equal(new URL(manifest.start_url, "https://app.test").pathname, "/");
assert.equal(manifest.prefer_related_applications, false);
for (const icon of manifest.icons) {
  const bytes = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
}
assert.ok(manifest.icons.some(icon => icon.sizes === "192x192" && icon.purpose === "any"));
assert.ok(manifest.icons.some(icon => icon.sizes === "512x512" && icon.purpose === "any"));
assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
assert.ok(layout.includes('crossOrigin="use-credentials"'), "The private manifest needs authenticated requests.");
console.log("PASS: install manifest, private-manifest credentials, and Android/iPhone icon files");

const handlers = new Map();
const stores = new Map([["unrelated-cache", new Map()], ["lipa-verify-static-old", new Map()]]);
let online = true;
const cachesMock = {
  async keys() { return [...stores.keys()]; },
  async delete(name) { return stores.delete(name); },
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async put(key, value) { store.set(key, value.clone()); },
      async match(key) { return store.get(key)?.clone(); },
    };
  },
};
class WorkerRequest extends Request {
  constructor(input, init) { super(new URL(input, "https://app.test"), init); }
}
vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
  URL, Request: WorkerRequest, Response, Set, caches: cachesMock,
  self: {
    location: { origin: "https://app.test" },
    addEventListener(name, callback) { handlers.set(name, callback); },
    async skipWaiting() {}, clients: { async claim() {} },
  },
  async fetch(request) {
    if (!online) throw new TypeError("offline");
    const path = new URL(request.url).pathname;
    const type = path.endsWith(".png") ? "image/png" : path.endsWith(".svg") ? "image/svg+xml" : "text/html";
    return new Response(path === "/offline.html" ? "Generic offline screen" : path === "/" ? "PRIVATE PAYMENT DATA" : "static icon", { headers: { "Content-Type": type } });
  },
});

let install;
handlers.get("install")({ waitUntil(promise) { install = promise; } });
await install;
let activation;
handlers.get("activate")({ waitUntil(promise) { activation = promise; } });
await activation;
assert.ok(!stores.has("lipa-verify-static-old"));
assert.ok(stores.has("unrelated-cache"));
const cached = stores.get("lipa-verify-static-v1");
assert.equal(cached.size, 6);
assert.ok([...cached.keys()].every(path => path === "/offline.html" || path === "/favicon.svg" || path.startsWith("/icons/")));

function dispatch(path, method = "GET", mode = "navigate") {
  let response;
  handlers.get("fetch")({ request: { url: new URL(path, "https://app.test").href, method, mode }, respondWith(promise) { response = promise; } });
  return response;
}
for (const path of ["/api/payments", "/api/payments/id/verify", "/signin-with-chatgpt?return_to=/", "/signout-with-chatgpt", "/callback", "https://other.test/"]) {
  assert.equal(dispatch(path), undefined, `The service worker must not intercept ${path}`);
}
assert.equal(dispatch("/api/payments/id/verify", "POST"), undefined);
assert.equal(dispatch("/", "POST"), undefined);
assert.equal(await (await dispatch("/")).text(), "PRIVATE PAYMENT DATA");
assert.equal(cached.has("/"), false, "Private app HTML must never be cached.");
online = false;
assert.equal(await (await dispatch("/")).text(), "Generic offline screen");
assert.equal(await (await dispatch("/icons/icon-192.png", "GET", "cors")).text(), "static icon");
for (const response of cached.values()) assert.ok(!(await response.clone().text()).includes("PRIVATE PAYMENT DATA"));
console.log("PASS: offline fallback, static-only cache, auth/API bypass, and no private payment caching");
