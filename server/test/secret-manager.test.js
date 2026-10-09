import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { SecretManager } from '../src/services/secret-manager.js';

const temporaryDirectories = new Set();

after(() => {
  for (const directory of temporaryDirectories) fs.rmSync(directory, { recursive: true, force: true });
  temporaryDirectories.clear();
});

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-vault-agent-secrets-'));
  fs.chmodSync(directory, 0o700);
  temporaryDirectories.add(directory);
  return directory;
}

describe('mounted secret consumer and rotation behavior', () => {
  it('reads an injected value, respects the cache, then observes a rotated file after cache invalidation', () => {
    const secretsDir = temporaryDirectory();
    const secretFile = path.join(secretsDir, 'JWT_SECRET');
    fs.writeFileSync(secretFile, 'jwt-version-one', { mode: 0o400 });
    const manager = new SecretManager({ env: {}, secretsDir, cacheTtlMs: 60_000 });

    assert.equal(manager.getSecret('JWT_SECRET'), 'jwt-version-one');
    const rotatedFile = path.join(secretsDir, '.JWT_SECRET.next');
    fs.writeFileSync(rotatedFile, 'jwt-version-two', { mode: 0o400 });
    fs.renameSync(rotatedFile, secretFile);
    assert.equal(manager.getSecret('JWT_SECRET'), 'jwt-version-one');

    manager.clearCache();
    assert.equal(manager.getSecret('JWT_SECRET'), 'jwt-version-two');
  });

  it('rejects path-like secret names and refuses symlinks that leave the mount', () => {
    const secretsDir = temporaryDirectory();
    const outsideDir = temporaryDirectory();
    const outsideFile = path.join(outsideDir, 'outside-secret');
    fs.writeFileSync(outsideFile, 'must-not-be-read', { mode: 0o400 });
    fs.symlinkSync(outsideFile, path.join(secretsDir, 'JWT_SECRET'));
    const manager = new SecretManager({ env: {}, secretsDir });

    assert.equal(manager.getSecret('../outside-secret'), '');
    assert.equal(manager.getSecret('JWT_SECRET'), '');
  });

  it('keeps environment fallback available if an injected file is absent', () => {
    const manager = new SecretManager({
      env: { JWT_SECRET: 'environment-fallback' },
      secretsDir: temporaryDirectory(),
    });
    assert.equal(manager.getSecret('JWT_SECRET'), 'environment-fallback');
  });
});
