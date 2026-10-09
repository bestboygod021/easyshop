import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY_SCRIPT = path.join(ROOT, 'tools', 'verify-release-artifacts.sh');
const tempDirs = new Set();

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-release-verify-'));
  tempDirs.add(directory);
  const release = path.join(directory, 'release');
  const bin = path.join(directory, 'bin');
  const log = path.join(directory, 'commands.jsonl');
  fs.mkdirSync(release);
  fs.mkdirSync(bin);

  fs.writeFileSync(path.join(release, 'EasyShop-Setup.exe'), 'not-a-real-executable');
  fs.writeFileSync(path.join(release, 'EasyShop-Setup.exe.sigstore.json'), '{}');
  fs.writeFileSync(path.join(release, 'easyshop.cdx.json'), JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    components: [{ type: 'library', name: 'easyshop-test', version: '1.0.0' }],
  }));

  for (const tool of ['cosign', 'gh']) {
    const file = path.join(bin, tool);
    fs.writeFileSync(file, `#!/usr/bin/env node\nconst fs = require('node:fs');\nfs.appendFileSync(process.env.VERIFY_TOOL_LOG, JSON.stringify({ tool: '${tool}', args: process.argv.slice(2) }) + '\\n');\n`);
    fs.chmodSync(file, 0o700);
  }

  return {
    directory,
    release,
    log,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
      VERIFY_TOOL_LOG: log,
    },
  };
}

afterEach(() => {
  for (const directory of tempDirs) fs.rmSync(directory, { recursive: true, force: true });
  tempDirs.clear();
});

describe('signed release verification helper', () => {
  it('verifies every executable signature and provenance and validates CycloneDX assets', () => {
    const test = fixture();
    const result = spawnSync('bash', [VERIFY_SCRIPT, test.release], { encoding: 'utf8', env: test.env });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Validated .*1 components/);
    assert.match(result.stdout, /Release artifact verification passed: 1 executable/);

    const commands = fs.readFileSync(test.log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(commands.map((command) => command.tool), ['cosign', 'gh']);
    assert.ok(commands[0].args.includes('--certificate-oidc-issuer'));
    const identityIndex = commands[0].args.indexOf('--certificate-identity-regexp');
    assert.equal(commands[0].args[identityIndex + 1], '^https://github[.]com/bestboygod021/easyshop/[.]github/workflows/sign-release[.]yml@refs/tags/[^/]+$');
    assert.ok(commands[0].args.at(-1).endsWith('EasyShop-Setup.exe'));
    assert.deepEqual(commands[1].args.slice(0, 2), ['attestation', 'verify']);
  });

  it('fails closed if an executable has no matching Sigstore bundle', () => {
    const test = fixture();
    fs.rmSync(path.join(test.release, 'EasyShop-Setup.exe.sigstore.json'));
    const result = spawnSync('bash', [VERIFY_SCRIPT, test.release], { encoding: 'utf8', env: test.env });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Sigstore bundle missing/);
    assert.equal(fs.existsSync(test.log), false, 'verification tools must not run without the required bundle');
  });

  it('rejects malformed or empty SBOMs before attempting signature verification', () => {
    const test = fixture();
    fs.writeFileSync(path.join(test.release, 'easyshop.cdx.json'), JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6', components: [] }));
    const result = spawnSync('bash', [VERIFY_SCRIPT, test.release], { encoding: 'utf8', env: test.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CycloneDX SBOM has no components/);
    assert.equal(fs.existsSync(test.log), false, 'verification tools must not run after invalid SBOM validation');
  });
});
