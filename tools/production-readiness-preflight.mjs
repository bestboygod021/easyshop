#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POSTGRES_SCHEMA_TABLE_NAMES } from '../server/src/db/postgres-schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_VERSION_RE = /^v[1-9][0-9]*$/;
const SECRET_STORE_PROVIDERS = new Set([
  'vault-agent',
  'aws-secrets-manager-csi',
  'gcp-secret-manager-csi',
  'azure-key-vault-csi',
  'external-secrets-operator',
]);
const PAYMENT_SANDBOX_PROVIDERS = new Set(['zarinpal', 'zibal', 'mrpardakht', 'bank_direct']);

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}

function hasFile(root, relativePath) {
  try { return fs.statSync(path.join(root, relativePath)).isFile(); } catch { return false; }
}

function inspectMountedSecret(directory, key, minimumBytes = 1) {
  if (!directory || !path.isAbsolute(directory)) return { ok: false, reason: 'mount_missing_or_not_absolute' };
  try {
    const realDirectory = fs.realpathSync(directory);
    const candidate = path.join(realDirectory, key);
    const realFile = fs.realpathSync(candidate);
    const relative = path.relative(realDirectory, realFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return { ok: false, reason: 'path_outside_mount' };
    const stat = fs.statSync(realFile);
    if (!stat.isFile()) return { ok: false, reason: 'not_a_regular_file' };
    if ((stat.mode & 0o022) !== 0 || (stat.mode & 0o004) !== 0) return { ok: false, reason: 'unsafe_permissions' };
    fs.accessSync(realFile, fs.constants.R_OK);
    const value = fs.readFileSync(realFile, 'utf8').trim();
    if (Buffer.byteLength(value, 'utf8') < minimumBytes) return { ok: false, reason: 'value_too_short' };
    return { ok: true, value };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

function activeSecretFile(name, env) {
  const envValue = String(env[name] || '').trim();
  if (envValue) return { ok: true, value: envValue, source: 'environment' };
  const mounted = inspectMountedSecret(env.SECRETS_DIR, name);
  return mounted.ok ? { ...mounted, source: 'mounted-file' } : { ok: false, reason: mounted.reason };
}

function inspectQualityGate(root) {
  const packageJson = readJson(path.join(root, 'package.json'));
  let workflow = '';
  try { workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'); } catch { /* report below */ }
  const configured = Boolean(
    packageJson.scripts?.lint
    && packageJson.devDependencies?.eslint
    && hasFile(root, 'eslint.config.mjs')
    && /npm run lint/.test(workflow),
  );
  return {
    status: configured ? 'ready' : 'blocked',
    blockers: configured ? [] : ['ESLint must be configured and required by CI.'],
    ci_lint_gate: configured,
  };
}

function inspectPostgres(root, env) {
  const serverPackage = readJson(path.join(root, 'server/package.json'));
  const rootPackage = readJson(path.join(root, 'package.json'));
  let dbSource = '';
  let configSource = '';
  let repositorySource = '';
  let ciWorkflowSource = '';
  try { dbSource = fs.readFileSync(path.join(root, 'server/src/db/index.js'), 'utf8'); } catch { /* report below */ }
  try { configSource = fs.readFileSync(path.join(root, 'server/src/config.js'), 'utf8'); } catch { /* report below */ }
  try { repositorySource = fs.readFileSync(path.join(root, 'server/src/db/repository.js'), 'utf8'); } catch { /* report below */ }
  try { ciWorkflowSource = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'); } catch { /* report below */ }

  const packageHasDriver = Boolean(
    serverPackage.dependencies?.pg
    || serverPackage.devDependencies?.pg
    || rootPackage.dependencies?.pg
    || rootPackage.devDependencies?.pg,
  );
  const adapterImplemented = hasFile(root, 'server/src/db/postgres-repository.js')
    && hasFile(root, 'server/src/db/repository.js');
  const postgresMigrations = hasFile(root, 'server/src/db/postgres-migrations.js');
  const postgresSchemaSourcePresent = hasFile(root, 'server/src/db/postgres-schema.js');
  const postgresSchemaSmokeTestPresent = hasFile(root, 'server/test/postgres-schema.test.js');
  const postgresSchemaImplemented = postgresSchemaSourcePresent
    && postgresSchemaSmokeTestPresent
    && POSTGRES_SCHEMA_TABLE_NAMES.length === 95;
  const postgresLiveIntegrationTestPresent = hasFile(root, 'server/test/postgres-server-integration.test.js');
  const postgresLiveIntegrationCiConfigured = postgresLiveIntegrationTestPresent
    && /postgres:16-alpine/.test(ciWorkflowSource)
    && /postgres-server-integration\.test\.js/.test(ciWorkflowSource);
  const sqliteSnapshotImportToolPresent = hasFile(root, 'tools/sqlite-to-postgres-migrate.mjs');
  const sqliteSyncStillActive = /DatabaseSync/.test(dbSource);
  const databaseUrlSupported = /DATABASE_URL/.test(configSource) || /DATABASE_URL/.test(repositorySource);

  let target = { configured: false, tlsConfigured: false, stagingConfirmed: false };
  const rawTarget = String(env.PG_REHEARSAL_DATABASE_URL || '').trim();
  if (rawTarget) {
    try {
      const parsed = new URL(rawTarget);
      target = {
        configured: ['postgres:', 'postgresql:'].includes(parsed.protocol),
        tlsConfigured: ['require', 'verify-ca', 'verify-full'].includes(parsed.searchParams.get('sslmode')),
        stagingConfirmed: env.PG_REHEARSAL_CONFIRM_STAGING === '1',
      };
    } catch {
      target = { configured: false, tlsConfigured: false, stagingConfirmed: env.PG_REHEARSAL_CONFIRM_STAGING === '1' };
    }
  }

  const blockers = [];
  if (!packageHasDriver) blockers.push('A PostgreSQL driver is not installed.');
  if (!adapterImplemented) blockers.push('The application has no PostgreSQL repository adapter.');
  if (!postgresMigrations) blockers.push('The versioned PostgreSQL migration runner is missing.');
  if (!postgresSchemaImplemented) blockers.push('The shared 95-table PostgreSQL schema bootstrap or its embedded PostgreSQL DDL test is missing.');
  if (!postgresLiveIntegrationCiConfigured) blockers.push('A real PostgreSQL service-backed CI integration test is missing.');
  if (!sqliteSnapshotImportToolPresent) blockers.push('A verified SQLite snapshot import and source/target reconciliation runner is missing.');
  if (sqliteSyncStillActive) blockers.push('The active DB layer still uses synchronous SQLite DatabaseSync helpers.');
  if (!databaseUrlSupported) blockers.push('The staged repository factory does not support a PostgreSQL DATABASE_URL.');
  if (!target.configured) blockers.push('PG_REHEARSAL_DATABASE_URL is missing or is not a PostgreSQL URL.');
  if (!target.tlsConfigured) blockers.push('The rehearsal target URL must explicitly require TLS with sslmode=require, verify-ca, or verify-full.');
  if (!target.stagingConfirmed) blockers.push('Set PG_REHEARSAL_CONFIRM_STAGING=1 only for an isolated, non-production staging database.');

  return {
    status: blockers.length ? 'blocked' : 'configured_unverified',
    blockers,
    postgres_driver_installed: packageHasDriver,
    repository_adapter_implemented: adapterImplemented,
    versioned_postgres_migrations: postgresMigrations,
    complete_postgres_application_schema: postgresSchemaImplemented,
    postgres_schema_table_count: POSTGRES_SCHEMA_TABLE_NAMES.length,
    postgres_schema_ddl_smoke_test_present: postgresSchemaSmokeTestPresent,
    postgres_real_server_ci_integration_defined: postgresLiveIntegrationCiConfigured,
    postgres_real_server_integration_executed: false,
    sqlite_snapshot_import_tool_present: sqliteSnapshotImportToolPresent,
    sqlite_database_sync_still_active: sqliteSyncStillActive,
    application_database_url_support: databaseUrlSupported,
    target_url_configured: target.configured,
    target_tls_configured: target.tlsConfigured,
    staging_confirmation_present: target.stagingConfirmed,
    network_connection_attempted: false,
  };
}

function inspectSecretMount(env) {
  const aiVersion = String(env.AI_KEY_ENCRYPTION_KEY_VERSION || 'v1');
  const auditVersion = String(env.AUDIT_LOG_HMAC_KEY_VERSION || 'v1');
  const versionInputsValid = KEY_VERSION_RE.test(aiVersion) && KEY_VERSION_RE.test(auditVersion);
  const aiKeyName = aiVersion === 'v1' ? 'AI_KEY_ENCRYPTION_KEY_V1' : `AI_KEY_ENCRYPTION_KEY_${aiVersion.toUpperCase()}`;
  const aiLegacyName = aiVersion === 'v1' ? 'AI_KEY_ENCRYPTION_KEY' : null;
  const required = [
    { name: 'JWT_SECRET', minBytes: 32 },
    { name: `AUDIT_LOG_HMAC_KEY_${auditVersion.toUpperCase()}`, minBytes: 32 },
    { name: 'BACKUP_ENCRYPTION_KEY', minBytes: 32 },
    { name: aiKeyName, minBytes: 32, fallback: aiLegacyName },
  ];
  const directory = String(env.SECRETS_DIR || '').trim();
  const files = {};
  const materials = [];
  const blockers = [];

  if (!directory || !path.isAbsolute(directory)) blockers.push('SECRETS_DIR must point to an absolute mounted-secret directory.');
  if (!versionInputsValid) blockers.push('AI and audit secret versions must use v1, v2, and so on.');
  let realDirectory = null;
  if (directory && path.isAbsolute(directory)) {
    try {
      realDirectory = fs.realpathSync(directory);
      if (!fs.statSync(realDirectory).isDirectory()) blockers.push('SECRETS_DIR is not a directory.');
      else if ((fs.statSync(realDirectory).mode & 0o022) !== 0) blockers.push('SECRETS_DIR must not be group- or world-writable.');
    } catch {
      blockers.push('SECRETS_DIR is not mounted or is not accessible.');
    }
  }

  for (const secret of required) {
    let result = realDirectory ? inspectMountedSecret(realDirectory, secret.name, secret.minBytes) : { ok: false, reason: 'mount_unavailable' };
    let selectedName = secret.name;
    if (!result.ok && secret.fallback && realDirectory) {
      const fallback = inspectMountedSecret(realDirectory, secret.fallback, secret.minBytes);
      if (fallback.ok) {
        result = fallback;
        selectedName = secret.fallback;
      }
    }
    files[secret.name] = result.ok ? 'ready' : result.reason;
    if (result.ok) materials.push({ name: selectedName, value: result.value });
    else blockers.push(`Mounted secret file is missing, too short, or unsafe: ${secret.name}.`);
  }

  const seen = new Set();
  for (const secret of materials) {
    if (seen.has(secret.value)) blockers.push(`Security key material must be unique; duplicate detected for ${secret.name}.`);
    seen.add(secret.value);
  }

  const provider = String(env.SECRET_STORE_PROVIDER || '').trim().toLowerCase();
  if (!SECRET_STORE_PROVIDERS.has(provider)) {
    blockers.push('Select the deployment-side Vault/KMS secret mount provider in SECRET_STORE_PROVIDER.');
  }
  if (env.BACKUP_ENCRYPTION_ENABLED !== '1') blockers.push('BACKUP_ENCRYPTION_ENABLED=1 must be explicit for a production rehearsal.');

  return {
    status: blockers.length ? 'blocked' : 'configured_unverified',
    blockers,
    mount_directory_configured: Boolean(realDirectory),
    secret_files: files,
    provider_label: SECRET_STORE_PROVIDERS.has(provider) ? provider : 'unspecified',
    provider_connectivity: 'not_checked',
    direct_kms_or_vault_api_call: false,
  };
}

function inspectPaymentSandbox(env) {
  const provider = String(env.PAYMENT_SANDBOX_PROVIDER || '').trim().toLowerCase();
  const providers = String(env.PAYMENT_PROVIDERS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const publicUrl = String(env.PUBLIC_URL || '').trim();
  const blockers = [];
  let publicUrlHttps = false;
  try {
    const parsed = new URL(publicUrl);
    publicUrlHttps = parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch { /* report below */ }

  if (!PAYMENT_SANDBOX_PROVIDERS.has(provider)) blockers.push('Select one implemented provider with PAYMENT_SANDBOX_PROVIDER.');
  if (env.PAYMENT_PROVIDER !== provider || !providers.includes(provider)) blockers.push('PAYMENT_PROVIDER and PAYMENT_PROVIDERS must explicitly select the sandbox provider.');
  if (providers.includes('mock') || env.PAYMENT_ALLOW_MOCK !== '0') blockers.push('Set PAYMENT_ALLOW_MOCK=0 and remove mock from the provider allowlist.');
  if (!publicUrlHttps) blockers.push('PUBLIC_URL must be a valid HTTPS storefront URL.');

  const providerSecretNames = {
    zarinpal: ['ZARINPAL_MERCHANT_ID'],
    zibal: ['ZIBAL_MERCHANT_ID'],
    mrpardakht: ['MRPARDAKHT_PIN'],
    bank_direct: ['BANK_DIRECT_MELLAT_TERMINAL_ID', 'BANK_DIRECT_MELLAT_USERNAME', 'BANK_DIRECT_MELLAT_PASSWORD'],
  };
  let credentialsConfigured = false;
  const sandboxVariables = {
    zarinpal: 'ZARINPAL_SANDBOX',
    zibal: 'ZIBAL_SANDBOX',
    mrpardakht: 'MRPARDAKHT_SANDBOX',
    bank_direct: 'BANK_DIRECT_SANDBOX',
  };
  if (provider && providerSecretNames[provider]) {
    credentialsConfigured = true;
    for (const name of providerSecretNames[provider]) {
      const value = activeSecretFile(name, env);
      if (!value.ok) {
        credentialsConfigured = false;
        blockers.push(`Required provider credential is unavailable: ${name}.`);
      }
    }
    if (env[sandboxVariables[provider]] !== '1') blockers.push(`Set ${sandboxVariables[provider]}=1; live mode is not accepted by this preflight.`);
  }
  if (provider === 'bank_direct' && String(env.BANK_DIRECT_BANK || '').toLowerCase() !== 'mellat') {
    blockers.push('The configured direct-bank adapter currently supports Mellat only.');
  }

  return {
    status: blockers.length ? 'blocked' : 'configured_unverified',
    blockers,
    provider: PAYMENT_SANDBOX_PROVIDERS.has(provider) ? provider : 'unspecified',
    public_url_https: publicUrlHttps,
    callback_route: PAYMENT_SANDBOX_PROVIDERS.has(provider) ? `/api/payments/callback/${provider}` : null,
    provider_credentials_configured: credentialsConfigured,
    sandbox_transaction_performed: false,
    callback_reachability_checked: false,
    independent_security_review: 'not_performed',
    network_connection_attempted: false,
  };
}

function inspectRecoveryAndCanary(root, env) {
  let dbSource = '';
  try { dbSource = fs.readFileSync(path.join(root, 'server/src/db/index.js'), 'utf8'); } catch { /* report below */ }
  const manifestPath = String(env.RECOVERY_DRILL_BACKUP_MANIFEST || '').trim();
  let manifestConfigured = false;
  if (manifestPath) {
    try { manifestConfigured = fs.statSync(path.resolve(manifestPath)).isFile(); } catch { /* report below */ }
  }
  const stagingUrl = String(env.STAGING_BASE_URL || '').trim();
  let stagingHttps = false;
  try { stagingHttps = new URL(stagingUrl).protocol === 'https:'; } catch { /* report below */ }

  const blockers = [];
  const rtoSeconds = Number(env.RECOVERY_RTO_TARGET_SECONDS);
  const rpoSeconds = Number(env.RECOVERY_RPO_TARGET_SECONDS);
  const rtoRpoTargetsConfigured = Number.isFinite(rtoSeconds) && rtoSeconds > 0
    && Number.isFinite(rpoSeconds) && rpoSeconds > 0;
  if (!manifestConfigured) blockers.push('RECOVERY_DRILL_BACKUP_MANIFEST must point to an existing manifest; run the backup verify command separately.');
  if (!env.BACKUP_REMOTE) blockers.push('A configured off-site backup remote is required.');
  if (env.BACKUP_OBJECT_LOCK_CONFIRMED !== '1') blockers.push('Object Lock must be independently configured and operator-confirmed.');
  if (env.RECOVERY_DRILL_TARGET !== 'staging' || !stagingHttps) blockers.push('A non-production HTTPS staging restore target is not configured.');
  if (!rtoRpoTargetsConfigured) blockers.push('Approved positive numeric RTO and RPO targets are required.');

  const selectedOrchestrator = 'kubernetes';
  const selectedTrafficRouter = 'argo-rollouts-nginx';
  const orchestrator = String(env.DEPLOYMENT_ORCHESTRATOR || '').trim().toLowerCase();
  const trafficRouter = String(env.DEPLOYMENT_TRAFFIC_ROUTER || '').trim().toLowerCase();
  const rolloutTemplatePresent = hasFile(root, 'ops/kubernetes/easyshop-rollout.template.yaml');
  const routingTemplatePresent = hasFile(root, 'ops/kubernetes/easyshop-routing.template.yaml');
  const analysisTemplatePresent = hasFile(root, 'ops/argo-rollouts/easyshop-canary-analysis.template.yaml');
  const canaryTemplatesPresent = rolloutTemplatePresent && routingTemplatePresent && analysisTemplatePresent;
  const stagingConfirmationPresent = env.DEPLOYMENT_STAGING_CONFIRM === '1';
  const kubernetesMetricsSecretConfirmed = env.KUBERNETES_METRICS_SECRET_CONFIRMED === '1';
  const kubernetesImagePullSecretConfirmed = env.KUBERNETES_IMAGE_PULL_SECRET_CONFIRMED === '1';
  const canaryConfigured = orchestrator === selectedOrchestrator
    && trafficRouter === selectedTrafficRouter
    && stagingHttps
    && stagingConfirmationPresent
    && kubernetesMetricsSecretConfirmed
    && kubernetesImagePullSecretConfirmed;
  const kubernetesClusterConfirmed = env.KUBERNETES_CLUSTER_CONFIRMED === '1';
  const argoControllerConfirmed = env.ARGO_ROLLOUTS_CONTROLLER_CONFIRMED === '1';
  const nginxControllerConfirmed = env.NGINX_INGRESS_CONFIRMED === '1';
  const prometheusConfirmed = env.PROMETHEUS_ROLLOUT_ANALYSIS_CONFIRMED === '1';
  const imageDefinitionPresent = hasFile(root, 'Dockerfile');
  const imageBuildPipelinePresent = imageDefinitionPresent
    && hasFile(root, '.dockerignore')
    && hasFile(root, '.github/workflows/container-image.yml');
  const baseImageDigestConfirmed = /^node:22\.[0-9]+\.[0-9]+-bookworm-slim@sha256:[a-f0-9]{64}$/.test(
    String(env.PRODUCTION_NODE_BASE_IMAGE || ''),
  );
  const imageDigestConfirmed = /^sha256:[a-f0-9]{64}$/.test(String(env.PRODUCTION_OCI_IMAGE_DIGEST || ''));
  const imageSignatureVerified = env.PRODUCTION_OCI_IMAGE_SIGNATURE_VERIFIED === '1';
  const postgresSchemaPresent = hasFile(root, 'server/src/db/postgres-schema.js');
  const sqliteSyncActive = /DatabaseSync/.test(dbSource);

  if (!canaryTemplatesPresent) blockers.push('Kubernetes/Argo Rollouts/NGINX canary templates are incomplete.');
  if (!imageBuildPipelinePresent) blockers.push('A hardened Dockerfile, context ignore list, or OCI build/publish workflow is missing.');
  if (!baseImageDigestConfirmed) blockers.push('Set PRODUCTION_NODE_BASE_IMAGE to a reviewed Node 22 Bookworm image pinned by sha256 digest.');
  if (!imageDigestConfirmed || !imageSignatureVerified) blockers.push('Provide a published immutable OCI digest and verify its signature before deployment.');
  if (!postgresSchemaPresent || sqliteSyncActive) blockers.push('Canary traffic is blocked until the complete PostgreSQL schema/cutover replaces active synchronous SQLite.');
  if (!canaryConfigured) blockers.push('Set the selected orchestrator/router, provision required image/metrics Secrets, and confirm an HTTPS non-production staging target before canary automation.');
  if (!kubernetesMetricsSecretConfirmed) blockers.push('Provision the namespace-scoped metrics auth Secret for both API and Prometheus Operator; the preflight does not inspect its value.');
  if (!kubernetesImagePullSecretConfirmed) blockers.push('Provision a least-privilege GHCR image-pull Secret for the staging namespace; the preflight does not inspect it.');
  if (!kubernetesClusterConfirmed || !argoControllerConfirmed || !nginxControllerConfirmed || !prometheusConfirmed) {
    blockers.push('Kubernetes, Argo Rollouts, ingress-nginx, and Prometheus Operator must be provisioned and independently confirmed.');
  }

  return {
    status: blockers.length ? 'blocked' : 'configured_unverified',
    blockers,
    backup_manifest_file_exists: manifestConfigured,
    offsite_remote_configured: Boolean(env.BACKUP_REMOTE),
    object_lock_operator_flag_present: env.BACKUP_OBJECT_LOCK_CONFIRMED === '1',
    object_lock_policy_independently_verified: false,
    staging_restore_target_configured: env.RECOVERY_DRILL_TARGET === 'staging' && stagingHttps,
    rto_rpo_targets_configured: rtoRpoTargetsConfigured,
    selected_orchestrator: selectedOrchestrator,
    selected_traffic_router: selectedTrafficRouter,
    kubernetes_rollout_templates_present: rolloutTemplatePresent && routingTemplatePresent,
    argo_analysis_template_present: analysisTemplatePresent,
    canary_provider_configured: canaryConfigured,
    deployment_staging_confirmation_present: stagingConfirmationPresent,
    kubernetes_metrics_secret_confirmed: kubernetesMetricsSecretConfirmed,
    kubernetes_image_pull_secret_confirmed: kubernetesImagePullSecretConfirmed,
    kubernetes_cluster_confirmed: kubernetesClusterConfirmed,
    argo_rollouts_controller_confirmed: argoControllerConfirmed,
    nginx_ingress_controller_confirmed: nginxControllerConfirmed,
    prometheus_rollout_analysis_confirmed: prometheusConfirmed,
    production_oci_image_definition_present: imageDefinitionPresent,
    production_oci_build_pipeline_present: imageBuildPipelinePresent,
    production_oci_base_digest_confirmed: baseImageDigestConfirmed,
    production_oci_digest_confirmed: imageDigestConfirmed,
    production_oci_signature_verified: imageSignatureVerified,
    complete_postgres_schema_present: postgresSchemaPresent,
    active_sync_sqlite_present: sqliteSyncActive,
    recovery_drill_performed: false,
    traffic_shift_or_rollback_performed: false,
    root_has_docker_orchestrator_definition: imageDefinitionPresent || hasFile(root, 'docker-compose.yml'),
    external_connections_attempted: false,
  };
}

export function buildProductionReadinessReport({ root = ROOT, env = process.env } = {}) {
  const checks = {
    quality_gate: inspectQualityGate(root),
    postgresql_rehearsal: inspectPostgres(root, env),
    mounted_kms_vault_secrets: inspectSecretMount(env),
    payment_sandbox: inspectPaymentSandbox(env),
    recovery_and_canary: inspectRecoveryAndCanary(root, env),
  };
  const blockers = Object.entries(checks)
    .filter(([, check]) => check.status === 'blocked')
    .flatMap(([name, check]) => check.blockers.map((blocker) => `${name}: ${blocker}`));
  const hasUnverified = Object.values(checks).some((check) => check.status === 'configured_unverified');
  return {
    schema_version: 1,
    readiness: blockers.length ? 'blocked' : hasUnverified ? 'configured_but_unverified' : 'ready',
    generated_at: new Date().toISOString(),
    no_external_requests_made: true,
    blockers,
    checks,
    note: 'This is a local configuration/source preflight only. It does not connect to PostgreSQL, KMS/Vault, payment sandboxes, object storage, staging, or a traffic router.',
  };
}

function main() {
  const report = buildProductionReadinessReport();
  console.log(JSON.stringify(report, null, 2));
  if (report.readiness !== 'ready') process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
