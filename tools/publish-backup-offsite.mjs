#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifySqliteBackup } from '../server/src/db/backup.js';
import { config } from '../server/src/config.js';

function requireValue(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  if (/[\r\n]/.test(value)) throw new Error(`${name} must not contain newlines.`);
  return value;
}

function runRclone(args) {
  const result = spawnSync('rclone', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') throw new Error('rclone is not installed; install and configure it outside the application runtime.');
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim().slice(-1200);
    throw new Error(`rclone ${args[0]} failed${detail ? `: ${detail}` : '.'}`);
  }
}

async function publish() {
  const manifestPath = path.resolve(requireValue('BACKUP_MANIFEST'));
  const remote = requireValue('BACKUP_REMOTE').replace(/\/+$/, '');
  if (process.env.BACKUP_OBJECT_LOCK_CONFIRMED !== '1') {
    throw new Error('Set BACKUP_OBJECT_LOCK_CONFIRMED=1 only after the destination bucket/container has versioning and Object Lock retention configured.');
  }
  const verified = await verifySqliteBackup(manifestPath, { encryptionKey: config.backup.encryptionKey });
  if (!verified.encrypted) throw new Error('Off-site publication refuses plaintext backups. Create an encrypted snapshot first.');

  const artifactRemote = `${remote}/${path.basename(verified.backup_path)}`;
  const manifestRemote = `${remote}/${path.basename(manifestPath)}`;
  // --immutable prevents replacing a previously published object; provider-side Object Lock is a separate control.
  runRclone(['copyto', verified.backup_path, artifactRemote, '--immutable']);
  runRclone(['check', verified.backup_path, artifactRemote, '--one-way']);
  // Publish the manifest last so consumers can treat its presence as the commit marker.
  runRclone(['copyto', manifestPath, manifestRemote, '--immutable']);
  runRclone(['check', manifestPath, manifestRemote, '--one-way']);
  console.log(JSON.stringify({
    published: true,
    encrypted: true,
    backup_file: path.basename(verified.backup_path),
    manifest_file: path.basename(manifestPath),
    sha256: verified.sha256,
    remote,
    object_lock_operator_confirmed: true,
    note: 'rclone verification succeeded; this script does not independently inspect the provider Object Lock policy.',
  }, null, 2));
}

publish().catch((error) => {
  console.error(`Off-site backup publication failed: ${error.message}`);
  process.exitCode = 1;
});
