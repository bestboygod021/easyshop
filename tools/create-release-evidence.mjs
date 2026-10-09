import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const STABLE_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const DIGEST_PINNED_NODE_BASE = /^node:22\.[0-9]+\.[0-9]+-bookworm-slim@sha256:[a-f0-9]{64}$/;
const BUILD_INPUT_FILES = Object.freeze([
  '.dockerignore',
  'Dockerfile',
  'package.json',
  'package-lock.json',
  'server/package.json',
  'web/package.json',
]);
const REQUIRED_OPERATIONAL_EVIDENCE = Object.freeze([
  'postgresql_staging_migration_and_reconciliation',
  'vault_sandbox_identity_and_rotation',
  'payment_sandbox_end_to_end',
  'offsite_backup_restore_and_rto_rpo',
  'staging_canary_and_rollback',
]);

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function requiredString(env, name) {
  const value = String(env[name] || '').trim();
  if (!value || /[\r\n]/.test(value)) throw new Error(`${name} is required and must be a single line.`);
  return value;
}

export function createReleaseEvidence({ env = process.env, root = ROOT, now = new Date() } = {}) {
  const repository = requiredString(env, 'GITHUB_REPOSITORY');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY is invalid.');
  const image = requiredString(env, 'OCI_IMAGE');
  const expectedImage = `ghcr.io/${repository.toLowerCase()}/api`;
  if (image.toLowerCase() !== expectedImage) throw new Error('OCI_IMAGE does not match the expected GHCR repository path.');

  const digest = requiredString(env, 'OCI_IMAGE_DIGEST');
  if (!SHA256.test(digest)) throw new Error('OCI_IMAGE_DIGEST must be an immutable sha256 digest.');
  const baseImage = requiredString(env, 'NODE_BASE_IMAGE');
  if (!DIGEST_PINNED_NODE_BASE.test(baseImage)) throw new Error('NODE_BASE_IMAGE must be a digest-pinned Node 22 Bookworm image.');
  const releaseTag = requiredString(env, 'RELEASE_TAG');
  if (!STABLE_TAG.test(releaseTag)) throw new Error('RELEASE_TAG must use stable vMAJOR.MINOR.PATCH format.');
  const sourceCommit = requiredString(env, 'SOURCE_COMMIT');
  if (!COMMIT.test(sourceCommit)) throw new Error('SOURCE_COMMIT must be a full 40-character commit SHA.');
  const runId = requiredString(env, 'GITHUB_RUN_ID');
  const runAttempt = requiredString(env, 'GITHUB_RUN_ATTEMPT');
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(runAttempt)) throw new Error('GitHub workflow run identifiers must be numeric.');
  const serverUrl = requiredString(env, 'GITHUB_SERVER_URL').replace(/\/$/, '');
  if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(serverUrl)) throw new Error('GITHUB_SERVER_URL must be HTTPS.');

  const buildInputHashes = Object.fromEntries(BUILD_INPUT_FILES.map((relativePath) => {
    const filePath = path.join(root, relativePath);
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile()) throw new Error(`Build input ${relativePath} must be a regular file.`);
    return [relativePath, sha256File(filePath)];
  }));

  return {
    schema_version: 1,
    generated_at_utc: now.toISOString(),
    subject: { name: image, digest },
    release: {
      repository,
      tag: releaseTag,
      source_commit: sourceCommit,
      workflow_run: {
        id: runId,
        attempt: runAttempt,
        url: `${serverUrl}/${repository}/actions/runs/${runId}`,
      },
    },
    build: {
      platform: 'linux/amd64',
      node_base_image: baseImage,
      input_sha256: buildInputHashes,
    },
    supply_chain: {
      image_signature: 'cosign_keyless_signature_created_by_release_workflow',
      image_provenance: 'github_build_provenance_attestation_created',
      image_sbom: 'buildkit_sbom_attestation_created',
      evidence_manifest_attestation: 'separate_github_attestation_required',
    },
    operational_evidence: Object.fromEntries(REQUIRED_OPERATIONAL_EVIDENCE.map((gate) => [gate, {
      status: 'not_verified_by_oci_release_workflow',
      evidence_sha256: null,
    }])),
  };
}

function main() {
  const outputPath = path.resolve(process.argv[2] || path.join(ROOT, 'artifacts/oci-release-evidence.json'));
  const evidence = createReleaseEvidence();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`Wrote redacted release evidence manifest: ${path.relative(process.cwd(), outputPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
