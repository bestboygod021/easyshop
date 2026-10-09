import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { runVersionedMigrations } from '../src/db/migrations.js';
import { createSqliteBackup, restoreSqliteBackup, runSqliteRestoreDrill, verifySqliteBackup } from '../src/db/backup.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-db-recovery-'));
const sourcePath = path.join(TMP, 'source.db');
const backupDirectory = path.join(TMP, 'backups');

before(() => {
  const db = new DatabaseSync(sourcePath);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE migration_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE products (id TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE orders (id TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE payments (id TEXT PRIMARY KEY)');
  db.exec('CREATE TABLE audit_logs (id TEXT PRIMARY KEY)');
  db.exec("INSERT INTO migration_probe (value) VALUES ('before-backup')");
  db.close();
});

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('versioned database migrations and recovery', () => {
  it('versions legacy database changes, verifies checksums, and is safely repeatable', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE payment_callback_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      authority TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    db.exec('CREATE TABLE audit_logs (id TEXT PRIMARY KEY, action TEXT NOT NULL, created_at TEXT NOT NULL)');

    const first = runVersionedMigrations(db);
    const second = runVersionedMigrations(db);
    assert.equal(first.length, 3);
    assert.deepEqual(second.map((migration) => migration.version), first.map((migration) => migration.version));
    const columns = db.prepare('PRAGMA table_info(payment_callback_events)').all().map((column) => column.name);
    assert.ok(columns.includes('callback_key'));
    assert.ok(columns.includes('deliveries'));
    assert.ok(columns.includes('last_seen_at'));
    const auditColumns = db.prepare('PRAGMA table_info(audit_logs)').all().map((column) => column.name);
    assert.ok(auditColumns.includes('chain_seq'));
    assert.ok(auditColumns.includes('previous_hash'));
    assert.ok(auditColumns.includes('entry_hash'));
    assert.ok(auditColumns.includes('key_version'));
    assert.equal(db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_audit_log_chain_seq'").get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM schema_migrations').get().count, 3);
    db.close();
  });

  it('creates a WAL-safe point-in-time snapshot, verifies its checksum, and restores a healthy database', async () => {
    const snapshot = await createSqliteBackup({
      sourcePath,
      destinationDir: backupDirectory,
      now: new Date('2026-10-09T10:00:00.000Z'),
      encrypt: false,
    });
    assert.equal(snapshot.format, 'easyshop-sqlite-snapshot-v1');
    assert.equal(snapshot.sqlite.integrity, 'ok');
    assert.ok(fs.existsSync(snapshot.backup_path));
    assert.ok(fs.existsSync(snapshot.manifest_path));

    const source = new DatabaseSync(sourcePath);
    source.exec("UPDATE migration_probe SET value='after-backup' WHERE id=1");
    source.close();

    const verified = await verifySqliteBackup(snapshot.manifest_path);
    assert.equal(verified.sha256, snapshot.sha256);
    const targetPath = path.join(TMP, 'restored', 'restored.db');
    const restored = await restoreSqliteBackup({ manifestPath: snapshot.manifest_path, targetPath });
    assert.equal(restored.sqlite.integrity, 'ok');

    const db = new DatabaseSync(targetPath, { readOnly: true });
    assert.equal(db.prepare('SELECT value FROM migration_probe WHERE id=1').get().value, 'before-backup');
    db.close();
    await assert.rejects(
      restoreSqliteBackup({ manifestPath: snapshot.manifest_path, targetPath }),
      /already exists/,
    );
  });

  it('encrypts snapshots with authenticated encryption and completes an isolated restore drill', async () => {
    const encryptionKey = 'backup-test-key-material-over-thirty-two-bytes-long';
    const snapshot = await createSqliteBackup({
      sourcePath,
      destinationDir: path.join(TMP, 'encrypted-backups'),
      now: new Date('2026-10-09T10:00:02.000Z'),
      encrypt: true,
      encryptionKey,
    });
    assert.equal(snapshot.format, 'easyshop-encrypted-sqlite-snapshot-v1');
    assert.equal(snapshot.encrypted, true);
    assert.match(snapshot.backup_file, /\.db\.enc$/);
    assert.equal(fs.existsSync(path.join(path.dirname(snapshot.backup_path), path.basename(snapshot.backup_path).replace(/\.enc$/, ''))), false,
      'encrypted backup directory must not retain a plaintext snapshot');

    const verified = await verifySqliteBackup(snapshot.manifest_path, { encryptionKey });
    assert.equal(verified.sqlite.integrity, 'ok');
    await assert.rejects(
      verifySqliteBackup(snapshot.manifest_path, { encryptionKey: 'wrong-key-material-over-thirty-two-bytes-long' }),
      /authentication failed/,
    );

    const restoredPath = path.join(TMP, 'encrypted-restore', 'restored.db');
    const restored = await restoreSqliteBackup({ manifestPath: snapshot.manifest_path, targetPath: restoredPath, encryptionKey });
    assert.equal(restored.encrypted, true);
    const restoredDb = new DatabaseSync(restoredPath, { readOnly: true });
    assert.equal(restoredDb.prepare('SELECT value FROM migration_probe WHERE id=1').get().value, 'after-backup');
    restoredDb.close();

    const drill = await runSqliteRestoreDrill(snapshot.manifest_path, TMP, { encryptionKey });
    assert.deepEqual(
      { verified: drill.verified, restored: drill.restored, encrypted: drill.encrypted, integrity: drill.integrity, scratch_cleaned: drill.scratch_cleaned },
      { verified: true, restored: true, encrypted: true, integrity: 'ok', scratch_cleaned: true },
    );
  });

  it('rejects a backup whose bytes no longer match the signed-off manifest checksum', async () => {
    const snapshot = await createSqliteBackup({
      sourcePath,
      destinationDir: backupDirectory,
      now: new Date('2026-10-09T10:00:01.000Z'),
      encrypt: false,
    });
    const bytes = fs.readFileSync(snapshot.backup_path);
    fs.writeFileSync(snapshot.backup_path, Buffer.concat([bytes, Buffer.from('tampered')]));
    await assert.rejects(verifySqliteBackup(snapshot.manifest_path), /SHA-256/);
  });

  it('keeps backup manifests bound to a basename and refuses path traversal', async () => {
    const manifestPath = path.join(backupDirectory, 'unsafe.manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      backup_file: '../source.db',
      sha256: crypto.createHash('sha256').update('x').digest('hex'),
    }));
    await assert.rejects(verifySqliteBackup(manifestPath), /unsafe filename/);
  });
});
