import assert from 'node:assert/strict';
import { ApiError, requestJson } from '../lib/client-api.ts';
const originalFetch = globalThis.fetch;
try {
  let calls = 0;
  globalThis.fetch = async (_path, options) => {
    calls++; assert.equal(options.cache, 'no-store'); assert.ok(options.signal);
    return Response.json({ ok: true });
  };
  assert.deepEqual(await requestJson('/api/example'), { ok: true });
  assert.equal(calls, 1);
  globalThis.fetch = async () => Response.json({ error: 'Already locked' }, { status: 409 });
  await assert.rejects(requestJson('/api/example'), error => error instanceof ApiError && error.status === 409 && error.message === 'Already locked');
  globalThis.fetch = async () => new Response('<html>Sign in</html>', { status: 401 });
  await assert.rejects(requestJson('/api/example'), error => error.status === 401 && error.message.includes('sign in'));
  globalThis.fetch = async () => new Response('<html>Unavailable</html>', { status: 502 });
  await assert.rejects(requestJson('/api/example'), error => error.status === 502 && !error.message.includes('<html>'));
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(requestJson('/api/example'), error => error.status === 0 && error.message.includes('connection'));
  let aborted = false;
  calls = 0;
  globalThis.fetch = (_path, { signal }) => {
    calls++;
    return new Promise((_,reject) => {
      const abort = () => { aborted = true; reject(new DOMException('Aborted','AbortError')); };
      if (signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true});
    });
  };
  await assert.rejects(requestJson('/api/example', { method:'POST' }, 10), error => error.status === 408);
  assert.equal(aborted, true); assert.equal(calls, 1, 'mutations must never automatically retry');
  const controller = new AbortController();
  const pending = requestJson('/api/example', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await assert.rejects(requestJson('/api/example', { signal: alreadyAborted.signal }), error => error.name === 'AbortError');
  console.log('PASS: uncached JSON requests, domain errors, HTML/sign-in failures, network errors, request deadlines, cancellation, and no automatic mutation retries');
} finally { globalThis.fetch = originalFetch; }
