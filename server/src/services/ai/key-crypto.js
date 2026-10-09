import crypto from 'node:crypto';
import { all, audit, run, tx } from '../../db/index.js';
import { config } from '../../config.js';
import { defaultSecretManager } from '../secret-manager.js';

const LEGACY_PREFIX = 'enc:v1:';
const VERSIONED_PREFIX = 'enc:v2:';
const LEGACY_KDF_SALT = 'easyshop-ai-provider-key-v1';
const KEY_VERSION_RE = /^v[1-9][0-9]*$/;
let cachedSecret = null;
let cachedVersion = null;
let cachedKey = null;

function validateVersion(version) {
  if (!KEY_VERSION_RE.test(String(version || ''))) throw new Error('AI key version must use the form v1, v2, etc.');
  return version;
}

function resolveSecret(version, override) {
  if (override !== undefined && override !== null) return String(override);
  const versioned = defaultSecretManager.getSecret(`AI_KEY_ENCRYPTION_KEY_${version.toUpperCase()}`);
  if (versioned) return versioned;
  if (version === 'v1' || version === config.ai.keyEncryptionKeyVersion) {
    return defaultSecretManager.getSecret('AI_KEY_ENCRYPTION_KEY');
  }
  return '';
}

function encryptionKey({ secret: secretOverride, version = config.ai.keyEncryptionKeyVersion, legacy = false } = {}) {
  const keyVersion = validateVersion(version);
  const secret = resolveSecret(keyVersion, secretOverride);
  if (!secret) throw new Error(`AI_KEY_ENCRYPTION_KEY_${keyVersion.toUpperCase()} is not configured.`);
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AI key-encryption secrets must contain at least 32 bytes.');
  }
  if (secretOverride === undefined && !legacy
    && (secret !== cachedSecret || keyVersion !== cachedVersion || !cachedKey)) {
    cachedSecret = secret;
    cachedVersion = keyVersion;
    cachedKey = crypto.scryptSync(secret, `easyshop-ai-provider-key-v2:${keyVersion}`, 32);
  }
  if (secretOverride === undefined && !legacy) return cachedKey;
  const salt = legacy ? LEGACY_KDF_SALT : `easyshop-ai-provider-key-v2:${keyVersion}`;
  return crypto.scryptSync(secret, salt, 32);
}

function envelopeKeyVersion(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith(LEGACY_PREFIX)) return 'v1';
  if (!value.startsWith(VERSIONED_PREFIX)) return null;
  const version = value.slice(VERSIONED_PREFIX.length).split(':', 1)[0];
  return KEY_VERSION_RE.test(version) ? version : null;
}

export function isEncryptedAiKey(value) {
  return typeof value === 'string' && (value.startsWith(LEGACY_PREFIX) || value.startsWith(VERSIONED_PREFIX));
}

export function hasAiKeyEncryptionKey() {
  try {
    encryptionKey({ version: config.ai.keyEncryptionKeyVersion });
    return true;
  } catch {
    return false;
  }
}

export function encryptAiKey(value, { secret, keyVersion = config.ai.keyEncryptionKeyVersion } = {}) {
  const plaintext = String(value ?? '').trim();
  if (!plaintext) return null;
  if (isEncryptedAiKey(plaintext)) throw new Error('Encrypted values cannot be submitted as provider keys.');
  const version = validateVersion(keyVersion);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey({ secret, version }), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSIONED_PREFIX}${version}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptAiKey(value, { secret, keyVersion: secretVersion } = {}) {
  if (typeof value !== 'string' || !value) return '';
  // Legacy plaintext values remain readable during migration; bootstrap encrypts them when possible.
  if (!isEncryptedAiKey(value)) return value;

  let keyVersion;
  let ivText;
  let tagText;
  let ciphertextText;
  let legacy = false;
  if (value.startsWith(LEGACY_PREFIX)) {
    [ivText, tagText, ciphertextText] = value.slice(LEGACY_PREFIX.length).split(':');
    keyVersion = secretVersion || 'v1';
    legacy = true;
  } else {
    [keyVersion, ivText, tagText, ciphertextText] = value.slice(VERSIONED_PREFIX.length).split(':');
    if (secretVersion && secretVersion !== keyVersion) {
      throw new Error('AI key envelope version does not match the requested key version.');
    }
  }
  if (!validateVersion(keyVersion) || !ivText || !tagText || !ciphertextText) {
    throw new Error('Stored AI provider key has an invalid encrypted format.');
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey({ secret, version: keyVersion, legacy }),
      Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(`Unable to decrypt an AI provider key; verify the configured encryption key for ${keyVersion}.`);
  }
}

export function maskAiKey(value) {
  const plaintext = decryptAiKey(value);
  if (!plaintext) return '';
  if (plaintext.length <= 10) return `${plaintext.slice(0, 2)}••••`;
  return `${plaintext.slice(0, 6)}••••${plaintext.slice(-4)}`;
}

/** Encrypt legacy plaintext keys on boot; fail closed in production if this cannot be done. */
export function migrateStoredAiProviderKeys() {
  const rows = all("SELECT id, api_key FROM ai_providers WHERE api_key IS NOT NULL AND api_key <> ''");
  const legacy = rows.filter((row) => !isEncryptedAiKey(row.api_key));
  const encrypted = rows.filter((row) => isEncryptedAiKey(row.api_key));

  if (encrypted.length) {
    // Validate every stored envelope/key early instead of failing on the first AI request.
    for (const row of encrypted) decryptAiKey(row.api_key);
  }
  if (!legacy.length) return { migrated: 0, legacyRemaining: 0 };

  if (!hasAiKeyEncryptionKey()) {
    if (config.isProd) {
      throw new Error('Set the active AI_KEY_ENCRYPTION_KEY_<VERSION> before starting production with legacy AI provider keys in the database.');
    }
    return { migrated: 0, legacyRemaining: legacy.length };
  }

  tx(() => {
    for (const row of legacy) {
      run('UPDATE ai_providers SET api_key = ?, updated_at = ? WHERE id = ? AND api_key = ?',
        encryptAiKey(row.api_key), new Date().toISOString(), row.id, row.api_key);
    }
  });
  return { migrated: legacy.length, legacyRemaining: 0 };
}

/**
 * Re-encrypt every stored provider credential to a new version. Values are fully
 * validated before the transaction; mixed/unknown keys fail without partial writes.
 */
export function rotateStoredAiProviderKeys({ oldSecret, newSecret, oldVersion = 'v1', newVersion = 'v2' } = {}) {
  const fromVersion = validateVersion(oldVersion);
  const toVersion = validateVersion(newVersion);
  if (typeof oldSecret !== 'string' || Buffer.byteLength(oldSecret, 'utf8') < 32
    || typeof newSecret !== 'string' || Buffer.byteLength(newSecret, 'utf8') < 32) {
    throw new Error('Both old and new AI encryption secrets must contain at least 32 bytes.');
  }
  if (oldSecret === newSecret || fromVersion === toVersion) {
    throw new Error('AI key rotation requires a different secret and a different key version.');
  }

  const rows = all("SELECT id, api_key FROM ai_providers WHERE api_key IS NOT NULL AND api_key <> ''");
  const plan = [];
  let alreadyOnNewKey = 0;
  let plaintextMigrated = 0;

  for (const row of rows) {
    if (!isEncryptedAiKey(row.api_key)) {
      plaintextMigrated += 1;
      plan.push({ row, plaintext: row.api_key });
      continue;
    }

    const storedVersion = envelopeKeyVersion(row.api_key);
    if (!storedVersion) throw new Error(`AI provider ${row.id} has an unsupported key envelope.`);
    if (storedVersion === toVersion) {
      // A retry after an already completed rotation is harmless and does not require old key material.
      decryptAiKey(row.api_key, { secret: newSecret, keyVersion: toVersion });
      alreadyOnNewKey += 1;
      continue;
    }
    if (storedVersion !== fromVersion) {
      throw new Error(`AI provider ${row.id} uses ${storedVersion}; expected ${fromVersion} or ${toVersion}.`);
    }
    plan.push({ row, plaintext: decryptAiKey(row.api_key, { secret: oldSecret, keyVersion: fromVersion }) });
  }

  const prepared = plan.map(({ row, plaintext }) => {
    const encrypted = encryptAiKey(plaintext, { secret: newSecret, keyVersion: toVersion });
    if (decryptAiKey(encrypted, { secret: newSecret, keyVersion: toVersion }) !== plaintext) {
      throw new Error(`AI provider ${row.id} failed the new-key verification step.`);
    }
    return { row, encrypted };
  });

  if (prepared.length) {
    tx(() => {
      for (const { row, encrypted } of prepared) {
        const changed = run('UPDATE ai_providers SET api_key=?, updated_at=? WHERE id=? AND api_key=?',
          encrypted, new Date().toISOString(), row.id, row.api_key);
        if (Number(changed.changes) !== 1) throw new Error(`AI provider ${row.id} changed during key rotation; no partial rotation committed.`);
      }
      audit({
        userName: 'ai-key-rotation',
        action: 'ai_key_rotation',
        entity: 'ai_provider',
        meta: { from_version: fromVersion, to_version: toVersion, rotated: prepared.length, already_on_new_key: alreadyOnNewKey, plaintext_migrated: plaintextMigrated },
      });
    });
  }
  return { rotated: prepared.length, alreadyOnNewKey, plaintextMigrated };
}
