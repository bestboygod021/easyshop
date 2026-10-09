import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { buildProductionReadinessReport } from './production-readiness-preflight.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tempDirs = new Set();

function secretMount(values) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-secret-mount-'));
  tempDirs.add(directory);
  fs.chmodSync(directory, 0o700);
  for (const [name, value] of Object.entries(values)) {
    const file = path.join(directory, name);
    fs.writeFileSync(file, value, { mode: 0o400 });
    fs.chmodSync(file, 0o400);
  }
  return directory;
}

after(() => {
  for (const directory of tempDirs) fs.rmSync(directory, { recursive: true, force: true });
  tempDirs.clear();
});

test('readiness preflight fails closed and states that it makes no external requests', () => {
  const report = buildProductionReadinessReport({ root: ROOT, env: {} });
  assert.equal(report.readiness, 'blocked');
  assert.equal(report.no_external_requests_made, true);
  assert.equal(report.checks.quality_gate.status, 'ready');
  assert.equal(report.checks.postgresql_rehearsal.status, 'blocked');
  assert.equal(report.checks.postgresql_rehearsal.postgres_driver_installed, true);
  assert.equal(report.checks.postgresql_rehearsal.repository_adapter_implemented, true);
  assert.equal(report.checks.postgresql_rehearsal.versioned_postgres_migrations, true);
  assert.equal(report.checks.postgresql_rehearsal.complete_postgres_application_schema, true);
  assert.equal(report.checks.postgresql_rehearsal.postgres_schema_table_count, 95);
  assert.equal(report.checks.postgresql_rehearsal.postgres_schema_ddl_smoke_test_present, true);
  assert.equal(report.checks.postgresql_rehearsal.postgres_real_server_ci_integration_defined, true);
  assert.equal(report.checks.postgresql_rehearsal.postgres_real_server_integration_executed, false);
  assert.equal(report.checks.postgresql_rehearsal.sqlite_snapshot_import_tool_present, false);
  assert.equal(report.checks.postgresql_rehearsal.application_database_url_support, true);
  assert.equal(report.checks.postgresql_rehearsal.sqlite_database_sync_still_active, true);
  assert.equal(report.checks.payment_sandbox.sandbox_transaction_performed, false);
  assert.equal(report.checks.recovery_and_canary.selected_orchestrator, 'kubernetes');
  assert.equal(report.checks.recovery_and_canary.selected_traffic_router, 'argo-rollouts-nginx');
  assert.equal(report.checks.recovery_and_canary.kubernetes_rollout_templates_present, true);
  assert.equal(report.checks.recovery_and_canary.argo_analysis_template_present, true);
  assert.equal(report.checks.recovery_and_canary.production_oci_image_definition_present, true);
  assert.equal(report.checks.recovery_and_canary.production_oci_build_pipeline_present, true);
  assert.equal(report.checks.recovery_and_canary.production_oci_base_digest_confirmed, false);
  assert.equal(report.checks.recovery_and_canary.production_oci_digest_confirmed, false);
  assert.equal(report.checks.recovery_and_canary.production_oci_signature_verified, false);
  assert.equal(report.checks.recovery_and_canary.traffic_shift_or_rollback_performed, false);
  assert.equal(report.checks.recovery_and_canary.object_lock_policy_independently_verified, false);
});

test('canary operator flags stay unverified and never claim a traffic shift or rollback', () => {
  const report = buildProductionReadinessReport({
    root: ROOT,
    env: {
      DEPLOYMENT_ORCHESTRATOR: 'kubernetes',
      DEPLOYMENT_TRAFFIC_ROUTER: 'argo-rollouts-nginx',
      DEPLOYMENT_STAGING_CONFIRM: '1',
      KUBERNETES_METRICS_SECRET_CONFIRMED: '1',
      KUBERNETES_IMAGE_PULL_SECRET_CONFIRMED: '1',
      KUBERNETES_CLUSTER_CONFIRMED: '1',
      ARGO_ROLLOUTS_CONTROLLER_CONFIRMED: '1',
      NGINX_INGRESS_CONFIRMED: '1',
      PROMETHEUS_ROLLOUT_ANALYSIS_CONFIRMED: '1',
      PRODUCTION_NODE_BASE_IMAGE: `node:22.22.3-bookworm-slim@sha256:${'a'.repeat(64)}`,
      PRODUCTION_OCI_IMAGE_DIGEST: `sha256:${'b'.repeat(64)}`,
      PRODUCTION_OCI_IMAGE_SIGNATURE_VERIFIED: '1',
      STAGING_BASE_URL: 'https://canary.staging.example.invalid',
    },
  });
  const check = report.checks.recovery_and_canary;
  assert.equal(check.canary_provider_configured, true);
  assert.equal(check.kubernetes_metrics_secret_confirmed, true);
  assert.equal(check.kubernetes_image_pull_secret_confirmed, true);
  assert.equal(check.production_oci_base_digest_confirmed, true);
  assert.equal(check.production_oci_digest_confirmed, true);
  assert.equal(check.production_oci_signature_verified, true);
  assert.equal(check.traffic_shift_or_rollback_performed, false);
  assert.equal(check.recovery_drill_performed, false);
  assert.equal(report.readiness, 'blocked');
  assert.equal(report.no_external_requests_made, true);
});

test('PostgreSQL rehearsal target is parsed without leaking the DSN or credentials', () => {
  const password = 'never-print-this-postgres-password';
  const report = buildProductionReadinessReport({
    root: ROOT,
    env: {
      PG_REHEARSAL_DATABASE_URL: `postgresql://rehearsal:${password}@pg-staging.example.invalid/easyshop?sslmode=verify-full`,
      PG_REHEARSAL_CONFIRM_STAGING: '1',
    },
  });
  assert.equal(report.checks.postgresql_rehearsal.target_url_configured, true);
  assert.equal(report.checks.postgresql_rehearsal.target_tls_configured, true);
  assert.equal(report.checks.postgresql_rehearsal.staging_confirmation_present, true);
  assert.equal(JSON.stringify(report).includes(password), false);
});

test('mounted secret preflight validates key versions, minimum lengths, and mount permissions without outputting values', () => {
  const values = {
    JWT_SECRET: 'jwt-material-that-is-unique-and-longer-than-thirty-two-bytes',
    AUDIT_LOG_HMAC_KEY_V1: 'audit-material-that-is-unique-and-longer-than-thirty-two-bytes',
    BACKUP_ENCRYPTION_KEY: 'backup-material-that-is-unique-and-longer-than-thirty-two-bytes',
    AI_KEY_ENCRYPTION_KEY_V1: 'ai-material-that-is-unique-and-longer-than-thirty-two-bytes',
  };
  const directory = secretMount(values);
  const report = buildProductionReadinessReport({
    root: ROOT,
    env: {
      SECRETS_DIR: directory,
      SECRET_STORE_PROVIDER: 'vault-agent',
      AI_KEY_ENCRYPTION_KEY_VERSION: 'v1',
      AUDIT_LOG_HMAC_KEY_VERSION: 'v1',
      BACKUP_ENCRYPTION_ENABLED: '1',
    },
  });
  const check = report.checks.mounted_kms_vault_secrets;
  assert.equal(check.status, 'configured_unverified');
  assert.ok(Object.values(check.secret_files).every((status) => status === 'ready'));
  assert.equal(check.provider_connectivity, 'not_checked');
  assert.equal(JSON.stringify(report).includes(values.JWT_SECRET), false);
});

test('sandbox configuration is only marked prepared; credentials and callbacks are never contacted', () => {
  const merchant = 'merchant-secret-that-must-not-appear';
  const report = buildProductionReadinessReport({
    root: ROOT,
    env: {
      PAYMENT_SANDBOX_PROVIDER: 'zarinpal',
      PAYMENT_PROVIDER: 'zarinpal',
      PAYMENT_PROVIDERS: 'zarinpal',
      PAYMENT_ALLOW_MOCK: '0',
      PUBLIC_URL: 'https://shop.staging.example.invalid',
      ZARINPAL_SANDBOX: '1',
      ZARINPAL_MERCHANT_ID: merchant,
    },
  });
  const check = report.checks.payment_sandbox;
  assert.equal(check.status, 'configured_unverified');
  assert.equal(check.callback_route, '/api/payments/callback/zarinpal');
  assert.equal(check.sandbox_transaction_performed, false);
  assert.equal(check.callback_reachability_checked, false);
  assert.equal(check.independent_security_review, 'not_performed');
  assert.equal(JSON.stringify(report).includes(merchant), false);
});

test('unsafe secret mounts and live payment configuration are rejected', () => {
  const directory = secretMount({
    JWT_SECRET: 'jwt-material-that-is-unique-and-longer-than-thirty-two-bytes',
    AUDIT_LOG_HMAC_KEY_V1: 'audit-material-that-is-unique-and-longer-than-thirty-two-bytes',
    BACKUP_ENCRYPTION_KEY: 'backup-material-that-is-unique-and-longer-than-thirty-two-bytes',
    AI_KEY_ENCRYPTION_KEY_V1: 'ai-material-that-is-unique-and-longer-than-thirty-two-bytes',
  });
  fs.chmodSync(path.join(directory, 'JWT_SECRET'), 0o444);
  const report = buildProductionReadinessReport({
    root: ROOT,
    env: {
      SECRETS_DIR: directory,
      SECRET_STORE_PROVIDER: 'vault-agent',
      AI_KEY_ENCRYPTION_KEY_VERSION: 'v1',
      AUDIT_LOG_HMAC_KEY_VERSION: 'v1',
      BACKUP_ENCRYPTION_ENABLED: '1',
      PAYMENT_SANDBOX_PROVIDER: 'zarinpal',
      PAYMENT_PROVIDER: 'zarinpal',
      PAYMENT_PROVIDERS: 'zarinpal',
      PAYMENT_ALLOW_MOCK: '1',
      PUBLIC_URL: 'http://localhost:4000',
      ZARINPAL_SANDBOX: '0',
      ZARINPAL_MERCHANT_ID: 'merchant-test',
    },
  });
  assert.equal(report.checks.mounted_kms_vault_secrets.status, 'blocked');
  assert.equal(report.checks.payment_sandbox.status, 'blocked');
  assert.ok(report.checks.payment_sandbox.blockers.some((reason) => reason.includes('PAYMENT_ALLOW_MOCK')));
});
