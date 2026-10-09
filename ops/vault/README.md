# Vault runtime secrets (selected provider)

## Decision and boundary

EasyShop selects **HashiCorp Vault KV v2 with a Vault Agent sidecar**. The deployment target is Kubernetes. A dedicated service account issues a short-lived projected JWT with audience `vault`; only the Agent sidecar mounts that token, authenticates through Vault's Kubernetes auth method, and renders individual secret files into a memory-backed shared volume. The API container receives read-only rendered files, not the service-account JWT or Vault client token. The API does not call Vault from its synchronous configuration path.

These are deployment templates, not evidence of a configured cluster. Vault address/CA, Kubernetes auth backend, role, namespace, service account, policy, Agent image digest, audit sink, and live secret versions must be provisioned by the platform owner. None are connected in this workspace.

The canary scrape credential `METRICS_BEARER_TOKEN` is a deliberate platform-secret exception: Prometheus Operator's ServiceMonitor and the API both reference the same namespace-scoped Kubernetes Secret (`easyshop-metrics-auth`). Keep Kubernetes Secret encryption at rest enabled, provision/rotate it through the approved cluster secret process, and restart API pods after rotation. It is not one of the four KV paths below, and its value is not stored in this repository.

## Workload identity and role

Create a dedicated Kubernetes service account named `easyshop-runtime` in namespace `easyshop` with `automountServiceAccountToken: false`. The Pod explicitly projects a short-lived service-account token with `audience: vault` and mounts it **only into the Agent sidecar**. Configure Vault's Kubernetes auth backend against the cluster issuer and token reviewer identity; keep reviewer credentials in the platform secret store, never in this repository or command logs.

Bind only the approved service account and namespace to the role:

```sh
vault policy write easyshop-runtime ops/vault/easyshop-runtime-policy.hcl
vault write auth/kubernetes/role/easyshop-runtime \
  bound_service_account_names=easyshop-runtime \
  bound_service_account_namespaces=easyshop \
  audience=vault \
  policies=easyshop-runtime \
  ttl=15m \
  max_ttl=1h
```

`agent.hcl` uses `auth/kubernetes` and the projected token path. Its sink is on an Agent-only memory volume. Never set `VAULT_TOKEN`, `VAULT_JWT`, a secret value, or a static `secret_id` in the API container. The API container must not mount either the projected JWT volume or Agent token volume.

## Least-privilege policy and rendered-file contract

`easyshop-runtime-policy.hcl` grants **read only** access to four exact KV v2 data paths. It grants no list, metadata, create, update, delete, or policy-management capability. Add provider-specific payment paths only when the provider/sandbox scope is approved; do not broaden the role to `kv/data/easyshop/production/*` or grant `list`.

Store one value at each path (with KV v2 data field `value`):

```text
kv/easyshop/production/JWT_SECRET                { value = <managed secret> }
kv/easyshop/production/AUDIT_LOG_HMAC_KEY_V1     { value = <managed secret> }
kv/easyshop/production/BACKUP_ENCRYPTION_KEY      { value = <managed secret> }
kv/easyshop/production/AI_KEY_ENCRYPTION_KEY_V1   { value = <managed secret> }
```

`agent.hcl` renders the matching `ops/vault/templates/*.ctmpl` files as `/vault/secrets/<KEY>` with mode `0400` and `error_on_missing_key=true`. Mount the shared secret volume read-only in the API container, set `SECRETS_DIR=/vault/secrets`, and set `SECRET_STORE_PROVIDER=vault-agent`. Keep the Agent token sink separate and inaccessible to the API container. The rollout template under `ops/kubernetes/` shows the intended mount topology; it is explicitly blocked from use until its deployment gates are cleared.

For a cluster, make a non-secret ConfigMap from these files (after reviewing and substituting the Vault service address/CA):

```sh
kubectl -n easyshop create configmap easyshop-vault-agent-config \
  --from-file=agent.hcl=ops/vault/agent.hcl \
  --from-file=templates=ops/vault/templates
```

The Kubernetes preflight checks local source files and mounted secret permissions but intentionally makes no Vault request.

## Rotation and verification

1. Create a new KV version in Vault; preserve the old version for rollback and data decryption.
2. Verify Agent auth and re-render in an isolated namespace. `SecretManager` caches file values for up to 30 seconds. Secrets loaded into `config.js` at process start (for example JWT/audit settings) require a graceful application restart after Agent update.
3. For AI encryption-key rotation, keep both versions mounted, set `AI_KEY_ENCRYPTION_KEY_VERSION`, make a verified encrypted backup, stop writers, and run the existing `npm run ai-keys:rotate` flow. Validate old and new records, then revoke the old Vault version only after restore/rollback retention permits it.
4. Record non-secret version metadata and timestamps. Never log secret values, rendered files, Vault JWTs/tokens, or connection strings.

`npm run test:vault-contract` adds a static source-contract check for the approved KV paths, rendered keys/modes, and separation of API and Agent token mounts; CI runs it without contacting Vault. `server/test/secret-manager.test.js` simulates a mounted file rotation and verifies cache invalidation/refresh plus rejection of symlinks outside the mount. `server/test/ai-key-crypto.test.js` covers application-level key rotation. These are local/static consumer tests only: they do **not** prove Vault auth, policy enforcement, Agent re-render, audit delivery, or production rotation. Those require a deployed Vault/Kubernetes target and independent evidence.
