import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../config.js';
import { verifySqliteBackup } from '../../db/backup.js';
import { defaultSecretManager } from '../secret-manager.js';

const __filename = fileURLToPath(import.meta.url);

async function runRotation() {
  const manifestPath = process.env.AI_KEY_ROTATION_BACKUP_MANIFEST;
  if (!manifestPath) throw new Error('Set AI_KEY_ROTATION_BACKUP_MANIFEST to a verified, recent SQLite backup manifest.');
  const oldSecret = defaultSecretManager.getSecret('AI_KEY_ENCRYPTION_KEY_OLD');
  const newSecret = defaultSecretManager.getSecret('AI_KEY_ENCRYPTION_KEY_NEW');
  const oldVersion = process.env.AI_KEY_ENCRYPTION_KEY_OLD_VERSION || 'v1';
  const newVersion = process.env.AI_KEY_ENCRYPTION_KEY_NEW_VERSION || 'v2';
  if (!oldSecret || !newSecret) {
    throw new Error('Load AI_KEY_ENCRYPTION_KEY_OLD and AI_KEY_ENCRYPTION_KEY_NEW through the secret manager; never pass secret values as CLI arguments.');
  }

  // Verify the recovery point before importing the DB layer (which may apply migrations on open).
  const backup = await verifySqliteBackup(manifestPath, { encryptionKey: config.backup.encryptionKey });
  const [{ db }, { rotateStoredAiProviderKeys }] = await Promise.all([
    import('../../db/index.js'),
    import('./key-crypto.js'),
  ]);
  try {
    const result = rotateStoredAiProviderKeys({ oldSecret, newSecret, oldVersion, newVersion });
    console.log(JSON.stringify({
      operation: 'ai-provider-key-rotation',
      backup_verified: true,
      backup_encrypted: Boolean(backup.encrypted),
      backup_sha256: backup.sha256,
      old_version: oldVersion,
      new_version: newVersion,
      ...result,
      next_step: `Set AI_KEY_ENCRYPTION_KEY_VERSION=${newVersion}, provide AI_KEY_ENCRYPTION_KEY_${newVersion.toUpperCase()}, restart all application instances, and verify AI provider health.`,
    }, null, 2));
  } finally {
    try { db.close(); } catch { /* process may already be closing */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRotation().catch((error) => {
    console.error(`AI key rotation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
