import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const serverRoot = path.resolve(new URL('..', import.meta.url).pathname);

function validate(env) {
  return spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { validateProductionConfig } from './src/config.js'; validateProductionConfig();",
  ], {
    cwd: serverRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATA_DIR: path.join(os.tmpdir(), `easyshop-prod-config-${process.pid}`),
      UPLOAD_DIR: path.join(os.tmpdir(), `easyshop-prod-uploads-${process.pid}`),
      JWT_SECRET: '',
      AUDIT_LOG_HMAC_KEY_VERSION: 'v1',
      AUDIT_LOG_HMAC_KEY_V1: 'audit-production-test-key-over-thirty-two-bytes',
      BACKUP_ENCRYPTION_ENABLED: '1',
      BACKUP_ENCRYPTION_KEY: 'backup-production-test-key-over-thirty-two-bytes',
      ALLOW_SELF_PROMOTION: '0',
      SEED_DEMO_DATA: '0',
      CORS_ORIGINS: '',
      ...env,
    },
  });
}

test('production refuses to start with a missing JWT secret', () => {
  const result = validate({ JWT_SECRET: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unique JWT_SECRET with at least 32 bytes/);
});

test('production requires versioned audit-HMAC and encrypted-backup keys', () => {
  const jwt = 'independent-production-secret-with-more-than-32-bytes';
  const missingAudit = validate({ JWT_SECRET: jwt, AUDIT_LOG_HMAC_KEY_V1: '' });
  assert.notEqual(missingAudit.status, 0);
  assert.match(missingAudit.stderr, /AUDIT_LOG_HMAC_KEY_<VERSION>/);

  const missingBackup = validate({ JWT_SECRET: jwt, BACKUP_ENCRYPTION_KEY: '' });
  assert.notEqual(missingBackup.status, 0);
  assert.match(missingBackup.stderr, /BACKUP_ENCRYPTION_KEY/);
});

test('production accepts secure settings and rejects self-promotion or wildcard CORS', () => {
  const safe = validate({ JWT_SECRET: 'independent-production-secret-with-more-than-32-bytes' });
  assert.equal(safe.status, 0, safe.stderr);

  const selfPromotion = validate({
    JWT_SECRET: 'independent-production-secret-with-more-than-32-bytes',
    ALLOW_SELF_PROMOTION: '1',
  });
  assert.notEqual(selfPromotion.status, 0);
  assert.match(selfPromotion.stderr, /ALLOW_SELF_PROMOTION must be disabled/);

  const wildcardCors = validate({
    JWT_SECRET: 'independent-production-secret-with-more-than-32-bytes',
    CORS_ORIGINS: '*',
  });
  assert.notEqual(wildcardCors.status, 0);
  assert.match(wildcardCors.stderr, /CORS_ORIGINS=\*/);

  const mockPayment = validate({
    JWT_SECRET: 'independent-production-secret-with-more-than-32-bytes',
    PAYMENT_PROVIDER: 'mock',
    PAYMENT_PROVIDERS: 'mock',
    PAYMENT_ALLOW_MOCK: '1',
  });
  assert.notEqual(mockPayment.status, 0);
  assert.match(mockPayment.stderr, /mock payment provider must not be enabled/);
});

test('production can resolve JWT, audit, and backup keys from a read-only mounted secret directory', () => {
  const secretsDir = fs.mkdtempSync(path.join(os.tmpdir(), `easyshop-mounted-secrets-${process.pid}-`));
  fs.chmodSync(secretsDir, 0o700);
  const mounted = {
    JWT_SECRET: 'jwt-mounted-production-material-with-more-than-thirty-two-bytes',
    AUDIT_LOG_HMAC_KEY_V1: 'audit-mounted-production-material-with-more-than-thirty-two-bytes',
    BACKUP_ENCRYPTION_KEY: 'backup-mounted-production-material-with-more-than-thirty-two-bytes',
    AI_KEY_ENCRYPTION_KEY_V1: 'ai-mounted-production-material-with-more-than-thirty-two-bytes',
  };
  for (const [name, value] of Object.entries(mounted)) {
    const file = path.join(secretsDir, name);
    fs.writeFileSync(file, value, { mode: 0o400 });
    fs.chmodSync(file, 0o400);
  }

  try {
    const result = validate({
      SECRETS_DIR: secretsDir,
      JWT_SECRET: '',
      AUDIT_LOG_HMAC_KEY_V1: '',
      BACKUP_ENCRYPTION_KEY: '',
      AI_KEY_ENCRYPTION_KEY_V1: '',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    fs.rmSync(secretsDir, { recursive: true, force: true });
  }
});
