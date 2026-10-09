import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePostgresPrepareArgs } from './prepare-postgres-staging.mjs';

describe('PostgreSQL staging schema preparation guard', () => {
  it('defaults to a no-network plan with the full schema inventory', () => {
    const plan = parsePostgresPrepareArgs([], {});
    assert.equal(plan.apply, false);
    assert.equal(plan.networkConnectionAttempted, false);
    assert.equal(plan.expectedTableCount, 95);
    assert.deepEqual(plan.migrationVersions, ['20261009_03_postgres_application_schema']);
  });

  it('requires explicit staging confirmation and a certificate-verifying TLS URL before applying', () => {
    assert.throws(
      () => parsePostgresPrepareArgs(['--apply'], {
        PG_REHEARSAL_DATABASE_URL: 'postgresql://staging:never-print-me@db.staging.invalid/easyshop?sslmode=verify-full',
        PG_REHEARSAL_CONFIRM_STAGING: '1',
      }),
      /--confirm-staging/,
    );
    assert.throws(
      () => parsePostgresPrepareArgs(['--apply', '--confirm-staging'], {
        PG_REHEARSAL_DATABASE_URL: 'postgresql://staging:never-print-me@db.staging.invalid/easyshop?sslmode=require',
        PG_REHEARSAL_CONFIRM_STAGING: '1',
      }),
      /verify-ca or sslmode=verify-full/,
    );
  });

  it('accepts only the intended isolated PostgreSQL rehearsal target shape without echoing its URL', () => {
    const connectionString = 'postgresql://staging:never-print-me@db.staging.invalid/easyshop?sslmode=verify-full';
    const plan = parsePostgresPrepareArgs(['--apply', '--confirm-staging'], {
      PG_REHEARSAL_DATABASE_URL: connectionString,
      PG_REHEARSAL_CONFIRM_STAGING: '1',
    });
    assert.equal(plan.apply, true);
    assert.equal(JSON.stringify(plan).includes('never-print-me'), false);
    assert.equal(JSON.stringify(plan).includes(connectionString), false);
  });
});
