import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const ENCRYPTED_FORMAT = 'easyshop-encrypted-sqlite-snapshot-v1';
const LEGACY_FORMAT = 'easyshop-sqlite-snapshot-v1';
const ENVELOPE_MAGIC = Buffer.from('EASYSHOPBK1\n', 'ascii');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = ENVELOPE_MAGIC.length + SALT_BYTES + IV_BYTES;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch { /* platform may not support POSIX modes */ }
}

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch { /* platform may not support POSIX modes */ }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function equalSha256(expectedHex, actualHex) {
  if (!/^[a-f0-9]{64}$/i.test(String(expectedHex || '')) || !/^[a-f0-9]{64}$/i.test(String(actualHex || ''))) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function deriveBackupKey(secret, salt) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must contain at least 32 bytes.');
  }
  return crypto.scryptSync(secret, salt, 32, SCRYPT_OPTIONS);
}

async function encryptBackupFile(sourcePath, targetPath, secret) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveBackupKey(secret, salt), iv);
  const header = Buffer.concat([ENVELOPE_MAGIC, salt, iv]);
  fs.writeFileSync(targetPath, header, { flag: 'wx', mode: 0o600 });
  try {
    await pipeline(
      fs.createReadStream(sourcePath),
      cipher,
      fs.createWriteStream(targetPath, { flags: 'a', mode: 0o600 }),
    );
    fs.appendFileSync(targetPath, cipher.getAuthTag(), { mode: 0o600 });
    try { fs.chmodSync(targetPath, 0o600); } catch { /* platform may not support POSIX modes */ }
  } catch (error) {
    try { fs.rmSync(targetPath, { force: true }); } catch { /* preserve the original error */ }
    throw error;
  }
}

async function decryptBackupFile(sourcePath, targetPath, secret) {
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile() || stat.size <= HEADER_BYTES + TAG_BYTES) {
    throw new Error('Encrypted backup is truncated or empty.');
  }

  const fd = fs.openSync(sourcePath, 'r');
  let header;
  let tag;
  try {
    header = Buffer.alloc(HEADER_BYTES);
    tag = Buffer.alloc(TAG_BYTES);
    if (fs.readSync(fd, header, 0, HEADER_BYTES, 0) !== HEADER_BYTES
      || fs.readSync(fd, tag, 0, TAG_BYTES, stat.size - TAG_BYTES) !== TAG_BYTES) {
      throw new Error('Encrypted backup header or authentication tag is incomplete.');
    }
  } finally {
    fs.closeSync(fd);
  }

  if (!header.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC)) {
    throw new Error('Encrypted backup has an unknown envelope version.');
  }
  const saltStart = ENVELOPE_MAGIC.length;
  const salt = header.subarray(saltStart, saltStart + SALT_BYTES);
  const iv = header.subarray(saltStart + SALT_BYTES, HEADER_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveBackupKey(secret, salt), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      stat.size - HEADER_BYTES - TAG_BYTES > 0
        ? fs.createReadStream(sourcePath, { start: HEADER_BYTES, end: stat.size - TAG_BYTES - 1 })
        : Readable.from([]),
      decipher,
      fs.createWriteStream(targetPath, { flags: 'wx', mode: 0o600 }),
    );
    try { fs.chmodSync(targetPath, 0o600); } catch { /* platform may not support POSIX modes */ }
  } catch (error) {
    try { fs.rmSync(targetPath, { force: true }); } catch { /* preserve the original error */ }
    if (error?.code === 'ERR_OSSL_EVP_BAD_DECRYPT' || /authenticat|bad decrypt/i.test(error?.message || '')) {
      throw new Error('Encrypted backup authentication failed; check the key and artifact integrity.', { cause: error });
    }
    throw error;
  }
}

function inspectDatabase(filePath) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check);
    if (integrity.length !== 1 || integrity[0] !== 'ok') {
      throw new Error(`SQLite integrity_check failed: ${integrity.join('; ').slice(0, 500)}`);
    }
    let migrations = [];
    try {
      migrations = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version);
    } catch { /* old legacy databases may not have a migration ledger */ }
    const pageCount = Number(db.prepare('PRAGMA page_count').get().page_count || 0);
    const pageSize = Number(db.prepare('PRAGMA page_size').get().page_size || 0);
    return { integrity: 'ok', migrations, page_count: pageCount, page_size: pageSize };
  } finally {
    db.close();
  }
}

function assertSafeManifest(manifest, directory) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Backup manifest is invalid.');
  if (typeof manifest.backup_file !== 'string' || path.basename(manifest.backup_file) !== manifest.backup_file) {
    throw new Error('Backup manifest contains an unsafe filename.');
  }
  if (!/^[a-f0-9]{64}$/.test(String(manifest.sha256 || ''))) throw new Error('Backup manifest has no valid SHA-256.');
  const isEncrypted = manifest.format === ENCRYPTED_FORMAT;
  const isLegacyPlaintext = manifest.format === LEGACY_FORMAT;
  if (isEncrypted && (!manifest.backup_file.endsWith('.db.enc')
    || manifest.encryption?.algorithm !== 'aes-256-gcm'
    || manifest.encryption?.kdf !== 'scrypt'
    || Number(manifest.encryption?.n) !== SCRYPT_OPTIONS.N
    || Number(manifest.encryption?.r) !== SCRYPT_OPTIONS.r
    || Number(manifest.encryption?.p) !== SCRYPT_OPTIONS.p
    || Number(manifest.encryption?.envelope) !== 1)) {
    throw new Error('Encrypted backup manifest metadata is unsupported or inconsistent.');
  }
  if (isLegacyPlaintext && !manifest.backup_file.endsWith('.db')) {
    throw new Error('Plaintext backup manifest must reference a .db snapshot.');
  }
  if (!isEncrypted && !isLegacyPlaintext) throw new Error('Backup manifest format is unsupported.');
  return { backupPath: path.resolve(directory, manifest.backup_file), isEncrypted };
}

function compareDigest(expected, actual, label) {
  if (!equalSha256(expected, actual)) throw new Error(`${label} SHA-256 does not match its manifest.`);
}

export async function createSqliteBackup({
  sourcePath = path.join(config.dataDir, 'easyshop.db'),
  destinationDir = config.backup.directory,
  now = new Date(),
  encrypt = config.backup.encryptionEnabled,
  encryptionKey = config.backup.encryptionKey,
} = {}) {
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationDir);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`SQLite source database not found: ${source}`);
  if (encrypt && (!encryptionKey || Buffer.byteLength(encryptionKey, 'utf8') < 32)) {
    throw new Error('Encrypted backups require BACKUP_ENCRYPTION_KEY with at least 32 bytes.');
  }
  ensureDirectory(destination);

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const stem = `easyshop-${timestamp}-${process.pid}`;
  const backupPath = path.join(destination, `${stem}.db${encrypt ? '.enc' : ''}`);
  const partialSnapshotPath = path.join(destination, `${stem}.partial.db`);
  const partialEncryptedPath = `${backupPath}.partial`;
  const manifestPath = path.join(destination, `${stem}.manifest.json`);
  if ([backupPath, manifestPath, partialSnapshotPath, partialEncryptedPath].some((candidate) => fs.existsSync(candidate))) {
    throw new Error('A backup artifact with this timestamp/process identifier already exists; choose a fresh timestamp.');
  }
  let sourceDb;

  try {
    sourceDb = new DatabaseSync(source);
    sourceDb.exec('PRAGMA busy_timeout=10000');
    sourceDb.exec(`VACUUM INTO ${sqlString(partialSnapshotPath)}`);
  } catch (error) {
    try { fs.rmSync(partialSnapshotPath, { force: true }); } catch { /* preserve the original error */ }
    throw error;
  } finally {
    sourceDb?.close();
  }

  try {
    const inspection = inspectDatabase(partialSnapshotPath);
    const plaintextStat = fs.statSync(partialSnapshotPath);
    const plaintextSha256 = await sha256File(partialSnapshotPath);
    let artifactPath = partialSnapshotPath;
    let format = LEGACY_FORMAT;
    let encryption = null;
    if (encrypt) {
      await encryptBackupFile(partialSnapshotPath, partialEncryptedPath, encryptionKey);
      artifactPath = partialEncryptedPath;
      format = ENCRYPTED_FORMAT;
      encryption = {
        algorithm: 'aes-256-gcm',
        kdf: 'scrypt',
        n: SCRYPT_OPTIONS.N,
        r: SCRYPT_OPTIONS.r,
        p: SCRYPT_OPTIONS.p,
        envelope: 1,
        key_id: process.env.BACKUP_ENCRYPTION_KEY_ID || 'active',
      };
    }
    const artifactStat = fs.statSync(artifactPath);
    const manifest = {
      format,
      encrypted: Boolean(encrypt),
      created_at: now.toISOString(),
      source: path.basename(source),
      backup_file: path.basename(backupPath),
      bytes: artifactStat.size,
      sha256: await sha256File(artifactPath),
      ...(encrypt ? { plaintext_bytes: plaintextStat.size, plaintext_sha256: plaintextSha256, encryption } : {}),
      sqlite: inspection,
      host: os.hostname().slice(0, 255),
    };
    if (encrypt) fs.rmSync(partialSnapshotPath, { force: true });
    fs.renameSync(artifactPath, backupPath);
    try { fs.chmodSync(backupPath, 0o600); } catch { /* platform may not support POSIX modes */ }
    writeJsonAtomic(manifestPath, manifest);
    return { ...manifest, backup_path: backupPath, manifest_path: manifestPath };
  } catch (error) {
    for (const candidate of [partialSnapshotPath, partialEncryptedPath]) {
      try { fs.rmSync(candidate, { force: true }); } catch { /* preserve the original error */ }
    }
    if (!fs.existsSync(manifestPath)) {
      try { fs.rmSync(backupPath, { force: true }); } catch { /* preserve the original error */ }
    }
    throw error;
  }
}

export async function verifySqliteBackup(manifestPath, { encryptionKey = config.backup.encryptionKey } = {}) {
  const resolvedManifest = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(resolvedManifest, 'utf8'));
  const { backupPath, isEncrypted } = assertSafeManifest(manifest, path.dirname(resolvedManifest));
  if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) throw new Error('Backup file is missing.');
  compareDigest(manifest.sha256, await sha256File(backupPath), 'Backup artifact');

  if (isEncrypted) {
    if (!encryptionKey || Buffer.byteLength(encryptionKey, 'utf8') < 32) {
      throw new Error('Verifying this encrypted backup requires BACKUP_ENCRYPTION_KEY.');
    }
    if (!/^[a-f0-9]{64}$/.test(String(manifest.plaintext_sha256 || ''))) {
      throw new Error('Encrypted backup manifest has no valid plaintext SHA-256.');
    }
    const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-backup-verify-'));
    const plaintextPath = path.join(temporaryDir, 'snapshot.db');
    try {
      await decryptBackupFile(backupPath, plaintextPath, encryptionKey);
      compareDigest(manifest.plaintext_sha256, await sha256File(plaintextPath), 'Decrypted backup');
      const sqlite = inspectDatabase(plaintextPath);
      return { ...manifest, sqlite, encrypted: true, backup_path: backupPath, manifest_path: resolvedManifest };
    } finally {
      fs.rmSync(temporaryDir, { recursive: true, force: true });
    }
  }

  const sqlite = inspectDatabase(backupPath);
  return { ...manifest, sqlite, encrypted: false, backup_path: backupPath, manifest_path: resolvedManifest };
}

export async function restoreSqliteBackup({ manifestPath, targetPath, encryptionKey = config.backup.encryptionKey } = {}) {
  if (!manifestPath || !targetPath) throw new Error('A backup manifest and target database path are required.');
  const verified = await verifySqliteBackup(manifestPath, { encryptionKey });
  const target = path.resolve(targetPath);
  ensureDirectory(path.dirname(target));
  if (fs.existsSync(target)) throw new Error(`Restore target already exists; restore to a new path: ${target}`);

  const temporary = `${target}.${process.pid}.restore.tmp`;
  try {
    if (verified.encrypted) {
      await decryptBackupFile(verified.backup_path, temporary, encryptionKey);
      compareDigest(verified.plaintext_sha256, await sha256File(temporary), 'Restored database');
    } else {
      fs.copyFileSync(verified.backup_path, temporary, fs.constants.COPYFILE_EXCL);
      compareDigest(verified.sha256, await sha256File(temporary), 'Restored database');
    }
    inspectDatabase(temporary);
    fs.renameSync(temporary, target);
    try { fs.chmodSync(target, 0o600); } catch { /* platform may not support POSIX modes */ }
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch { /* preserve the original error */ }
    throw error;
  }
  return { ...verified, restored_to: target };
}

export async function runSqliteRestoreDrill(manifestPath, parentDirectory = os.tmpdir(), { encryptionKey = config.backup.encryptionKey } = {}) {
  if (!manifestPath) throw new Error('Usage: node server/src/db/backup.js drill <manifest.json> [scratch-parent-directory]');
  const scratch = fs.mkdtempSync(path.join(path.resolve(parentDirectory), 'easyshop-restore-drill-'));
  const targetPath = path.join(scratch, 'restored.db');
  try {
    const restored = await restoreSqliteBackup({ manifestPath, targetPath, encryptionKey });
    const db = new DatabaseSync(targetPath, { readOnly: true });
    let tables;
    try {
      tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    } finally {
      db.close();
    }
    const required = ['users', 'products', 'orders', 'payments', 'audit_logs'];
    const missing = required.filter((table) => !tables.has(table));
    if (missing.length) throw new Error(`Restore drill is missing required application tables: ${missing.join(', ')}.`);
    return {
      verified: true,
      restored: true,
      integrity: restored.sqlite.integrity,
      encrypted: restored.encrypted,
      bytes: restored.encrypted ? restored.plaintext_bytes : restored.bytes,
      migration_count: restored.sqlite.migrations.length,
      required_tables: required,
      scratch_cleaned: true,
    };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

async function runCli(args) {
  const [command = 'create', first, second] = args;
  if (command === 'create') {
    const backup = await createSqliteBackup();
    console.log(JSON.stringify(backup, null, 2));
    return;
  }
  if (command === 'verify') {
    if (!first) throw new Error('Usage: node server/src/db/backup.js verify <manifest.json>');
    console.log(JSON.stringify(await verifySqliteBackup(first), null, 2));
    return;
  }
  if (command === 'restore') {
    if (!first || !second) throw new Error('Usage: node server/src/db/backup.js restore <manifest.json> <target.db>');
    console.log(JSON.stringify(await restoreSqliteBackup({ manifestPath: first, targetPath: second }), null, 2));
    return;
  }
  if (command === 'drill') {
    console.log(JSON.stringify(await runSqliteRestoreDrill(first, second), null, 2));
    return;
  }
  throw new Error(`Unknown backup command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`SQLite backup operation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
