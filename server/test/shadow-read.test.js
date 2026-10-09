import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ShadowReadHarness } from '../src/db/shadow-read.js';

function repository(read) {
  return { read };
}

describe('PostgreSQL shadow-read parity harness', () => {
  it('is disabled by default and returns only the primary result', async () => {
    let shadowCalls = 0;
    const harness = new ShadowReadHarness({
      primary: repository(async () => [{ id: 1 }]),
      shadow: repository(async () => { shadowCalls += 1; return [{ id: 1 }]; }),
    });

    const result = await harness.read({
      name: 'orders.account.list',
      primaryRead: (db) => db.read(),
      shadowRead: (db) => db.read(),
    });

    assert.deepEqual(result, [{ id: 1 }]);
    assert.equal(shadowCalls, 0);
  });

  it('runs the shadow query in the background and reports matching row HMACs only', async () => {
    let finishShadow;
    const comparisons = [];
    const harness = new ShadowReadHarness({
      primary: repository(async () => [{ id: 1, total: 25n }]),
      shadow: repository(() => new Promise((resolve) => { finishShadow = resolve; })),
      enabled: true,
      onComparison: (comparison) => comparisons.push(comparison),
    });

    const primary = await harness.read({
      name: 'orders.account.list',
      primaryRead: (db) => db.read(),
      shadowRead: (db) => db.read(),
    });
    assert.deepEqual(primary, [{ id: 1, total: 25n }]);
    assert.equal(comparisons.length, 0, 'primary response must not wait for the shadow query');

    finishShadow([{ total: 25n, id: 1 }]);
    await harness.flush();
    assert.equal(comparisons[0].status, 'match');
    assert.equal(comparisons[0].primary_rows, 1);
    assert.match(comparisons[0].primary_hmac_sha256, /^[a-f0-9]{64}$/);
    assert.equal(comparisons[0].primary_hmac_sha256, comparisons[0].shadow_hmac_sha256);
    assert.equal(Object.hasOwn(comparisons[0], 'rows'), false);
  });

  it('reports mismatches without disclosing row contents or SQL', async () => {
    const comparisons = [];
    const harness = new ShadowReadHarness({
      primary: repository(async () => [{ email: 'private@example.test', total: 100 }]),
      shadow: repository(async () => [{ email: 'private@example.test', total: 99 }]),
      enabled: true,
      onComparison: (comparison) => comparisons.push(comparison),
    });

    const primary = await harness.read({
      name: 'customer.orders.summary',
      primaryRead: (db) => db.read('SELECT email, total FROM orders'),
      shadowRead: (db) => db.read('SELECT email, total FROM orders'),
    });
    await harness.flush();

    assert.equal(primary[0].total, 100);
    assert.equal(comparisons[0].status, 'mismatch');
    assert.equal(JSON.stringify(comparisons).includes('private@example.test'), false);
    assert.equal(JSON.stringify(comparisons).includes('SELECT'), false);
  });

  it('records a sanitized shadow error and never lets the shadow failure replace primary data', async () => {
    const comparisons = [];
    const harness = new ShadowReadHarness({
      primary: repository(async () => [{ id: 'primary-row' }]),
      shadow: repository(async () => {
        const error = new Error('postgresql://user:secret@host/db');
        error.code = '42P01';
        throw error;
      }),
      enabled: true,
      onComparison: (comparison) => comparisons.push(comparison),
    });

    assert.deepEqual(await harness.read({
      name: 'catalog.active.list',
      primaryRead: (db) => db.read(),
      shadowRead: (db) => db.read(),
    }), [{ id: 'primary-row' }]);
    await harness.flush();
    assert.equal(comparisons[0].status, 'shadow_error');
    assert.equal(comparisons[0].error_code, '42P01');
    assert.equal(JSON.stringify(comparisons).includes('secret'), false);
  });

  it('propagates primary failures and rejects query labels that could contain arbitrary user data', async () => {
    let shadowCalls = 0;
    const harness = new ShadowReadHarness({
      primary: repository(async () => { throw new Error('primary unavailable'); }),
      shadow: repository(async () => { shadowCalls += 1; return []; }),
      enabled: true,
    });

    await assert.rejects(harness.read({
      name: 'catalog.active.list',
      primaryRead: (db) => db.read(),
      shadowRead: (db) => db.read(),
    }), /primary unavailable/);
    await assert.rejects(harness.read({
      name: 'user@example.test',
      primaryRead: (db) => db.read(),
      shadowRead: (db) => db.read(),
    }), /stable, non-sensitive/);
    assert.equal(shadowCalls, 0);
  });
});
