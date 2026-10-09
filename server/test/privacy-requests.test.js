import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-privacy-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(TMP, 'data');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.SEED_DEMO_DATA = '1';
process.env.LOG_LEVEL = 'error';

const { app, bootstrap } = await import('../src/index.js');
const { db } = await import('../src/db/index.js');
bootstrap();
let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  db.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

async function call(method, route, { token, body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

const post = (route, body, token) => call('POST', route, { body, token });
const patch = (route, body, token) => call('PATCH', route, { body, token });
const login = async (email, password) => {
  const result = await post('/api/auth/login', { email, password });
  assert.equal(result.response.status, 200);
  return result.payload.session.accessToken;
};

describe('privacy request governance', () => {
  it('requires re-authentication for erasure requests and supports audited review states', async () => {
    const customerToken = await login('user@easyshop.ir', 'Shopper#2026');
    const missingPassword = await post('/api/account/privacy-requests', { request_type: 'erasure' }, customerToken);
    assert.equal(missingPassword.response.status, 403);

    const wrongPassword = await post('/api/account/privacy-requests', {
      request_type: 'erasure', password: 'not-the-current-password',
    }, customerToken);
    assert.equal(wrongPassword.response.status, 403);

    const submitted = await post('/api/account/privacy-requests', {
      request_type: 'erasure', password: 'Shopper#2026',
    }, customerToken);
    assert.equal(submitted.response.status, 201);
    const requestId = submitted.payload.request.id;
    assert.equal(submitted.payload.request.status, 'pending');

    const duplicate = await post('/api/account/privacy-requests', {
      request_type: 'access',
    }, customerToken);
    assert.equal(duplicate.response.status, 409);
    const customerView = await call('GET', '/api/account/privacy-requests', { token: customerToken });
    assert.equal(customerView.payload.items.length, 1);
    assert.equal(customerView.payload.items[0].id, requestId);

    const adminToken = await login('admin@easyshop.ir', 'ShopMaster#2026');
    const queue = await call('GET', '/api/admin/privacy-requests', { token: adminToken });
    assert.ok(queue.payload.items.some((request) => request.id === requestId));

    const approved = await patch(`/api/admin/privacy-requests/${requestId}`, {
      status: 'approved', review_notes: 'Approved for the documented manual erasure workflow.',
    }, adminToken);
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload.request.status, 'approved');

    const fulfilled = await patch(`/api/admin/privacy-requests/${requestId}`, {
      status: 'fulfilled', review_notes: 'Manual subject-request workflow completed in this fixture.',
    }, adminToken);
    assert.equal(fulfilled.response.status, 200);
    assert.equal(fulfilled.payload.request.status, 'fulfilled');

    const invalidTransition = await patch(`/api/admin/privacy-requests/${requestId}`, {
      status: 'rejected',
    }, adminToken);
    assert.equal(invalidTransition.response.status, 409);
  });
});
