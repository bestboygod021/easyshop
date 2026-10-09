import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-ai-key-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.AI_KEY_ENCRYPTION_KEY = 'unit-test-key-material-that-is-longer-than-thirty-two-bytes';

const { db, get, run } = await import('../src/db/index.js');
const { config } = await import('../src/config.js');
const { defaultSecretManager } = await import('../src/services/secret-manager.js');
const { seedProviders } = await import('../src/db/seed.js');
const {
  decryptAiKey, encryptAiKey, isEncryptedAiKey, maskAiKey,
  migrateStoredAiProviderKeys, rotateStoredAiProviderKeys,
} = await import('../src/services/ai/key-crypto.js');
seedProviders();

after(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('provider key uses authenticated encryption and is safely masked', () => {
  const secret = 'sk-provider-test-secret-123456789';
  const encrypted = encryptAiKey(secret);
  assert.ok(isEncryptedAiKey(encrypted));
  assert.notEqual(encrypted, secret);
  assert.equal(decryptAiKey(encrypted), secret);
  assert.equal(maskAiKey(encrypted).includes(secret), false);
  assert.notEqual(encrypted, encryptAiKey(secret), 'random IV باید هر بار ciphertext تازه بسازد');
});

test('legacy plaintext provider keys migrate in place', () => {
  const legacy = 'legacy-provider-key-that-must-not-remain';
  run('UPDATE ai_providers SET api_key = ? WHERE slug = ?', legacy, 'openai');

  const result = migrateStoredAiProviderKeys();
  assert.deepEqual(result, { migrated: 1, legacyRemaining: 0 });
  const stored = get('SELECT api_key FROM ai_providers WHERE slug = ?', 'openai').api_key;
  assert.ok(isEncryptedAiKey(stored));
  assert.notEqual(stored, legacy);
  assert.equal(decryptAiKey(stored), legacy);
});

test('provider-key rotation is atomic, versioned, verifiable, and safe to retry', () => {
  const oldSecret = process.env.AI_KEY_ENCRYPTION_KEY;
  const newSecret = 'new-versioned-ai-key-material-with-more-than-thirty-two-bytes';
  const originalVersion = config.ai.keyEncryptionKeyVersion;
  const oldValue = get('SELECT api_key FROM ai_providers WHERE slug = ?', 'openai').api_key;

  const rotated = rotateStoredAiProviderKeys({ oldSecret, newSecret, oldVersion: 'v1', newVersion: 'v2' });
  assert.deepEqual(rotated, { rotated: 1, alreadyOnNewKey: 0, plaintextMigrated: 0 });
  const encrypted = get('SELECT api_key FROM ai_providers WHERE slug = ?', 'openai').api_key;
  assert.match(encrypted, /^enc:v2:v2:/);
  assert.equal(decryptAiKey(encrypted, { secret: newSecret, keyVersion: 'v2' }), 'legacy-provider-key-that-must-not-remain');
  assert.throws(() => decryptAiKey(encrypted, { secret: oldSecret, keyVersion: 'v2' }), /Unable to decrypt/);

  process.env.AI_KEY_ENCRYPTION_KEY_V2 = newSecret;
  config.ai.keyEncryptionKeyVersion = 'v2';
  defaultSecretManager.clearCache();
  assert.equal(decryptAiKey(encrypted), 'legacy-provider-key-that-must-not-remain');
  assert.deepEqual(
    rotateStoredAiProviderKeys({ oldSecret, newSecret, oldVersion: 'v1', newVersion: 'v2' }),
    { rotated: 0, alreadyOnNewKey: 1, plaintextMigrated: 0 },
  );

  const unsupportedSecret = 'unsupported-key-material-that-is-longer-than-thirty-two-bytes';
  run('UPDATE ai_providers SET api_key=? WHERE slug=?', encryptAiKey('unrecognized version', { secret: unsupportedSecret, keyVersion: 'v3' }), 'gemini');
  const beforeFailedRotation = get('SELECT api_key FROM ai_providers WHERE slug=?', 'openai').api_key;
  assert.throws(
    () => rotateStoredAiProviderKeys({ oldSecret: newSecret, newSecret: unsupportedSecret, oldVersion: 'v2', newVersion: 'v4' }),
    /uses v3/,
  );
  assert.equal(get('SELECT api_key FROM ai_providers WHERE slug=?', 'openai').api_key, beforeFailedRotation,
    'preflight failure must leave every previously rotated provider untouched');

  // Keep the active key setting aligned with the rotated fixture for any later assertions.
  config.ai.keyEncryptionKeyVersion = 'v2';
  assert.notEqual(oldValue, encrypted);
  assert.equal(originalVersion, 'v1');
});
