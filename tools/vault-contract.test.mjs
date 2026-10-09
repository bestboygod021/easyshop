import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const EXPECTED_SECRET_KEYS = [
  'AI_KEY_ENCRYPTION_KEY_V1',
  'AUDIT_LOG_HMAC_KEY_V1',
  'BACKUP_ENCRYPTION_KEY',
  'JWT_SECRET',
];

function blocks(source, expression) {
  return [...source.matchAll(expression)].map((match) => match[1]);
}

describe('Vault Agent source contract (static only)', () => {
  it('grants read-only access to exactly the approved KV v2 secret paths', () => {
    const policy = read('ops/vault/easyshop-runtime-policy.hcl');
    const policyBlocks = [...policy.matchAll(/path\s+"([^"]+)"\s*\{([^}]+)\}/g)];
    const paths = policyBlocks.map((match) => match[1].split('/').at(-1)).sort();

    assert.deepEqual(paths, EXPECTED_SECRET_KEYS);
    for (const match of policyBlocks) {
      assert.match(match[2], /capabilities\s*=\s*\[\s*"read"\s*\]/);
      assert.doesNotMatch(match[2], /list|create|update|delete|sudo/);
    }
    assert.doesNotMatch(policy, /\*|kv\/metadata|kv\/data\/easyshop\/production\/"/);
  });

  it('renders only the approved keys with restrictive permissions and missing-key failure', () => {
    const agent = read('ops/vault/agent.hcl');
    const templateBlocks = blocks(agent, /template\s*\{([^}]+)\}/g);
    assert.equal(templateBlocks.length, EXPECTED_SECRET_KEYS.length);

    const destinations = [];
    for (const block of templateBlocks) {
      const source = block.match(/source\s*=\s*"[^"]+\/([A-Z0-9_]+)\.ctmpl"/)?.[1];
      const destination = block.match(/destination\s*=\s*"\/vault\/secrets\/([A-Z0-9_]+)"/)?.[1];
      assert.ok(source);
      assert.equal(destination, source);
      destinations.push(destination);
      assert.match(block, /perms\s*=\s*"0400"/);
      assert.match(block, /error_on_missing_key\s*=\s*true/);
    }
    assert.deepEqual(destinations.sort(), EXPECTED_SECRET_KEYS);
  });

  it('keeps the short-lived projected JWT and Agent token sink outside the API container', () => {
    const rollout = read('ops/kubernetes/easyshop-rollout.template.yaml');
    const serviceAccount = read('ops/kubernetes/easyshop-runtime-serviceaccount.yaml');
    const api = rollout.match(/- name: api\n([\s\S]*?)(?=\n[ ]{8}- name: vault-agent\n)/)?.[1] || '';
    const agent = rollout.match(/- name: vault-agent\n([\s\S]*?)(?=\n[ ]{6}volumes:)/)?.[1] || '';

    assert.match(serviceAccount, /automountServiceAccountToken:\s*false/);
    assert.match(rollout, /serviceAccountName:\s*easyshop-runtime/);
    assert.match(rollout, /automountServiceAccountToken:\s*false/);
    assert.match(rollout, /audience:\s*vault/);
    assert.match(rollout, /expirationSeconds:\s*600/);
    assert.match(api, /name: vault-secrets[\s\S]*?readOnly:\s*true/);
    assert.doesNotMatch(api, /vault-auth-token|vault-agent-token/);
    assert.match(agent, /name: vault-auth-token/);
    assert.match(agent, /name: vault-agent-token/);
    assert.match(agent, /name: vault-secrets/);
    assert.match(rollout, /name: vault-agent-token\n\s+emptyDir:\n\s+medium: Memory/);
  });

  it('keeps static tests explicitly separate from live Vault and rotation evidence', () => {
    const readme = read('ops/vault/README.md');
    assert.match(readme, /templates, not evidence of a configured cluster/i);
    assert.match(readme, /do \*\*not\*\* prove Vault auth, policy enforcement, Agent re-render, audit delivery, or production rotation/i);
  });
});
