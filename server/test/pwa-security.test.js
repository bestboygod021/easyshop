import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const swSource = fs.readFileSync(new URL('../../web/public/sw.js', import.meta.url), 'utf8');

function createWorker(fetchImpl) {
  const listeners = new Map();
  const cacheCalls = { match: 0, open: 0, put: 0 };
  const caches = {
    async match() {
      cacheCalls.match += 1;
      return undefined;
    },
    async open() {
      cacheCalls.open += 1;
      return {
        async put() { cacheCalls.put += 1; },
        async addAll() {},
      };
    },
    async keys() { return ['easyshop-v1', 'easyshop-v2']; },
    async delete() { return true; },
  };
  const self = {
    location: { origin: 'https://shop.test' },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  vm.runInNewContext(swSource, { self, caches, fetch: fetchImpl, URL, Response, Promise, JSON });

  return {
    cacheCalls,
    async dispatchGet(path) {
      let responsePromise;
      listeners.get('fetch')({
        request: new Request(`https://shop.test${path}`, { method: 'GET' }),
        respondWith(promise) { responsePromise = promise; },
      });
      assert.ok(responsePromise, `service worker should handle ${path}`);
      return responsePromise;
    },
  };
}

test('PWA never reads or writes API responses through Cache Storage', async () => {
  const worker = createWorker(async () => new Response('{"wallet":123}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
  const response = await worker.dispatchGet('/api/account/wallet');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"wallet":123}');
  assert.deepEqual(worker.cacheCalls, { match: 0, open: 0, put: 0 });
});

test('PWA returns a private no-store 503 for API requests while offline', async () => {
  const worker = createWorker(async () => { throw new Error('offline'); });
  const response = await worker.dispatchGet('/api/auth/me');
  assert.equal(response.status, 503);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(await response.text(), /آفلاین هستید/);
  assert.deepEqual(worker.cacheCalls, { match: 0, open: 0, put: 0 });
});
