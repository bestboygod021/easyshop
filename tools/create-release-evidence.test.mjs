import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { createReleaseEvidence } from './create-release-evidence.mjs';

const temporaryDirectories = new Set();

after(() => {
  for (const directory of temporaryDirectories) fs.rmSync(directory, { recursive: true, force: true });
  temporaryDirectories.clear();
});

function evidenceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-release-evidence-'));
  temporaryDirectories.add(root);
  fs.mkdirSync(path.join(root, 'server'));
  fs.mkdirSync(path.join(root, 'web'));
  fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM node:22.22.3-bookworm-slim\n');
  fs.writeFileSync(path.join(root, '.dockerignore'), '.env\nserver/data\n');
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
  fs.writeFileSync(path.join(root, 'server/package.json'), '{}\n');
  fs.writeFileSync(path.join(root, 'web/package.json'), '{}\n');
  return {
    root,
    env: {
      GITHUB_REPOSITORY: 'bestboygod021/easyshop',
      OCI_IMAGE: 'ghcr.io/bestboygod021/easyshop/api',
      OCI_IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`,
      NODE_BASE_IMAGE: `node:22.22.3-bookworm-slim@sha256:${'b'.repeat(64)}`,
      RELEASE_TAG: 'v1.2.3',
      SOURCE_COMMIT: 'c'.repeat(40),
      GITHUB_RUN_ID: '12345',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_SERVER_URL: 'https://github.com',
      DATABASE_URL: 'postgresql://should-not-appear:secret@example.test/db',
      VAULT_TOKEN: 'should-not-appear',
    },
  };
}

describe('OCI release evidence manifest', () => {
  it('binds an immutable image digest to source, base and build-input hashes without claiming operational gates', () => {
    const fixture = evidenceFixture();
    const evidence = createReleaseEvidence({ env: fixture.env, root: fixture.root, now: new Date('2026-10-09T12:00:00.000Z') });

    assert.deepEqual(evidence.subject, {
      name: fixture.env.OCI_IMAGE,
      digest: fixture.env.OCI_IMAGE_DIGEST,
    });
    assert.equal(evidence.release.tag, 'v1.2.3');
    assert.equal(evidence.release.source_commit, fixture.env.SOURCE_COMMIT);
    assert.equal(evidence.release.workflow_run.url, 'https://github.com/bestboygod021/easyshop/actions/runs/12345');
    assert.deepEqual(Object.keys(evidence.build.input_sha256).sort(), [
      '.dockerignore',
      'Dockerfile',
      'package-lock.json',
      'package.json',
      'server/package.json',
      'web/package.json',
    ]);
    assert.ok(Object.values(evidence.build.input_sha256).every((digest) => /^[a-f0-9]{64}$/.test(digest)));
    assert.equal(evidence.operational_evidence.postgresql_staging_migration_and_reconciliation.status, 'not_verified_by_oci_release_workflow');
    assert.equal(evidence.operational_evidence.payment_sandbox_end_to_end.evidence_sha256, null);

    const serialized = JSON.stringify(evidence);
    assert.doesNotMatch(serialized, /should-not-appear|DATABASE_URL|VAULT_TOKEN|postgresql:\/\//);
  });

  it('rejects mutable tags, unpinned bases, malformed digests, and mismatched image namespaces', () => {
    const fixture = evidenceFixture();
    assert.throws(() => createReleaseEvidence({ env: { ...fixture.env, RELEASE_TAG: 'v1.2' }, root: fixture.root }), /stable vMAJOR\.MINOR\.PATCH/);
    assert.throws(() => createReleaseEvidence({ env: { ...fixture.env, NODE_BASE_IMAGE: 'node:22-bookworm-slim' }, root: fixture.root }), /digest-pinned/);
    assert.throws(() => createReleaseEvidence({ env: { ...fixture.env, OCI_IMAGE_DIGEST: 'latest' }, root: fixture.root }), /immutable sha256/);
    assert.throws(() => createReleaseEvidence({ env: { ...fixture.env, OCI_IMAGE: 'ghcr.io/other/api' }, root: fixture.root }), /does not match/);
  });
});
