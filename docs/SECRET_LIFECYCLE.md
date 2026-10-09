# Secret lifecycle: sourcing, rotation, audit, and known gaps

## Current implementation

`SecretManager` reads from environment or a mounted secret file, caches values briefly, and can clear its cache. The selected production pattern is **HashiCorp Vault KV v2 with a Vault Agent sidecar**: Kubernetes workload identity authenticates the Agent, which renders individual files into `SECRETS_DIR`; the API itself does not make synchronous Vault calls. `JWT_SECRET` is resolved through this manager so a mounted file can supply it. The deployment policy, projected-token mount, Agent config, and templates are in [`ops/vault/README.md`](../ops/vault/README.md).

The sample Vault policy grants read-only access to exact KV paths and no list/write capability. Use a dedicated Kubernetes service account and a read-only mount, files mode `0400` (or `0440` with a constrained shared group), and a directory that is not group/world writable. `SECRET_STORE_PROVIDER=vault-agent` is still only a label for the readiness preflight; it does not prove that Vault, the Kubernetes auth role, or the Agent sidecar is connected. `SecretManager` now restricts secret names and refuses mount symlinks that resolve outside the configured directory. The preflight requires versioned audit/AI keys plus JWT and backup keys and never prints values.

Rotation support currently includes:

- **AI provider encryption key:** versioned AES-GCM envelope plus transactional database re-encryption CLI (`server/src/services/ai/rotate-keys.js`). A rotation audit event records version/count metadata, not secret values.
- **Audit HMAC key:** each row stores `key_version`; verification resolves all historical `AUDIT_LOG_HMAC_KEY_Vn` values. To rotate, provision the new version, keep the old one available, switch `AUDIT_LOG_HMAC_KEY_VERSION`, restart, verify the whole chain, then remove the old key only after policy-approved retention/backup constraints permit it.
- **Payment, JWT and backup secrets:** source them externally and follow provider-specific overlap/restart/rollback instructions. The application does not rotate these automatically or prove that an upstream provider has revoked an old credential.

## Required operator process

1. Identify the secret owner, consumers, version and expiry in the chosen secret store; configure least-privilege access and alerting for failed reads/expiry.
2. Generate a replacement using a cryptographically secure secret manager; never place values in source control, command arguments, CI output or chat.
3. Where the provider supports overlap, deploy the new value, run health/sandbox checks, then revoke the old credential. For DB encryption keys, take and verify an independent encrypted backup before re-encryption.
4. Record a change ticket/rotation timestamp and validate audit integrity. Do not record secret values or hashes of low-entropy credentials in the audit metadata.
5. Keep old key versions only as long as restore/rollback requires, then revoke and remove them under dual control.

## Preflight and rotation drill

```bash
npm run --silent ops:preflight
npm run ai-keys:rotate
```

The first command checks local configuration and secret-file permissions without contacting an external provider; it exits non-zero when deployment prerequisites are missing. The second command is a database mutation and must only be run after the encrypted backup manifest is verified, all writers are stopped, and old/new versioned keys are available from the approved store. In a real deployment, verify both the mounted secret versions and provider health after the restart, then restore a pre-rotation backup in an isolated environment while retaining the historical key.

## What remains unimplemented

The Vault provider and integration pattern are selected and example policy/Agent configuration are versioned, but the actual Vault endpoint/CA, Kubernetes auth backend/role, namespace/service account, Agent deployment, mounted production files, audit sink, and rotation hook have not been provisioned or connected. There is intentionally no direct Vault API client in the application. Automatic expiry/revocation control, central secret inventory, and end-to-end provider rotation evidence are also absent. The mount preflight and local rotation tests do not prove Vault connectivity, workload identity claims, policy enforcement, audit delivery, or production rotation.
