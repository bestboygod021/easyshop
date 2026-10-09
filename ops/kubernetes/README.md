# Kubernetes deployment and canary decision

## Selected control plane

The selected deployment design is **Kubernetes + Argo Rollouts + ingress-nginx**, with Prometheus Operator scraping the canary Service for AnalysisRun metrics. Argo Rollouts changes NGINX canary weights; failed analysis aborts the rollout and restores traffic to the last stable ReplicaSet. This is a design decision and versioned template set, not a deployed cluster or proof of automatic rollback.

Files in this directory and `ops/argo-rollouts/` are **templates; do not apply them yet**:

- `easyshop-runtime-serviceaccount.yaml` disables default token automount.
- `easyshop-rollout.template.yaml` defines staged 10/25/50/100% traffic and mounts the Vault Agent token only in the sidecar.
- `easyshop-routing.template.yaml` defines stable/canary Services, an NGINX Ingress, and a Prometheus Operator ServiceMonitor.
- `../argo-rollouts/easyshop-canary-analysis.template.yaml` gates progression on minimum canary request count, HTTP 5xx ratio (<1%), and p95 latency (<750 ms).

Use immutable, signed OCI image digests. The API image expected by this template must include `/bin/sh`, Node.js, and `server/src/index.js` at its working directory; its entry command waits for all required initial Vault renders before starting the API. Do not put secrets in this repository. Provision a read-only GHCR image-pull Secret named `easyshop-ghcr-pull`, the namespace-scoped `easyshop-metrics-auth` Kubernetes Secret, and the staging TLS Secret out of band. The metrics Secret's `token` key is injected into the API as `METRICS_BEARER_TOKEN` and referenced by the ServiceMonitor, so both sides use the same high-entropy value. Protect Kubernetes Secret storage with cluster encryption at rest; rotate it through the approved secret process and restart API pods because `config.js` loads it at startup. Pin Argo Rollouts, ingress-nginx, Prometheus Operator, and Vault Agent images/controllers to reviewed versions/digests before deployment. The Prometheus service address and `ServiceMonitor` selector/release label must be adjusted to the actual cluster.

## Hard blockers before any multi-pod rollout

1. **Database safety:** the API still uses a local synchronous SQLite `DatabaseSync` file and does not use the new PostgreSQL pilot. Multiple stable/canary pods with independent SQLite files would split order/payment state; a shared SQLite file is not a safe cluster database. The shared 95-table PostgreSQL bootstrap is present, but test it on a real staging PostgreSQL server, complete snapshot import/reconciliation/domain wiring, and rehearse cutover/rollback first.
2. **Build/release supply chain:** a multi-stage Dockerfile, `.dockerignore`, and GHCR build/SBOM/provenance/signing workflow are now defined. The workflow has not run in GitHub, no image digest/signature has been published, and the reviewed `NODE_BASE_IMAGE` digest repository variable is not configured here; do not promote a tag placeholder.
3. **Platform:** no Kubernetes cluster, Argo Rollouts controller, ingress-nginx controller/traffic plugin, Prometheus Operator, DNS/TLS, Vault auth backend, or runtime service account is connected. There is no staging URL, GHCR pull Secret, metrics auth Secret, or deploy credential available here.
4. **Application state:** uploads, process-local rate limits/realtime, and in-memory SLO counters need shared/object storage or distributed replacements/aggregation before horizontal traffic can be considered production-safe.
5. **Operational evidence:** an isolated staging restore, load profile, canary failure injection, actual ingress weight change, automated rollback, and reviewer approval are still required.

The rollout template intentionally lacks a shared SQLite PVC and is marked `DO NOT APPLY`. `replicas: 3` is only a target after the database and state blockers are resolved. Readiness flags such as `DEPLOYMENT_ORCHESTRATOR=kubernetes`, `DEPLOYMENT_TRAFFIC_ROUTER=argo-rollouts-nginx`, and `STAGING_BASE_URL=https://...` are self-reported configuration only; the local preflight never connects to or verifies a cluster.

## Promotion and rollback policy

At each 10%, 25%, and 50% step, wait and run `easyshop-canary-sli`. Insufficient canary traffic, >1% 5xx, p95 ≥750 ms, unavailable metrics, or failed probes abort the rollout. Do not bypass failed analysis by manually promoting. At 100%, verify stable service, callback and order invariants, and observability before closing the release. The template does not analyze live payment success; use provider-approved sandbox cases only after a reachable staging callback and reviewer-approved test plan exist.

Use Argo Rollouts commands in the future staging runbook, capture `kubectl argo rollouts get rollout easyshop-api --watch`, AnalysisRun status, NGINX weights/upstreams, Prometheus query output, pod events, and before/after synthetic order IDs. Do not use production customer traffic or real payment cards for rollback rehearsal.

## RTO/RPO measurement

The initial proposal remains **RTO ≤ 60 minutes** and **RPO ≤ 5 minutes**, pending service-owner approval and measured staging feasibility. For each recovery drill record UTC times for failure start, detection, traffic restored, datastore recovery, and reconciliation completion. Compute:

- `RTO = time durable service is restored - time customer impact began`
- `RPO = incident time - timestamp of the latest durable commit present in the restored datastore` (report the data-loss interval as a positive duration)

Attach backup manifest/hash, restore logs, reconciled order/payment totals, canary AnalysisRun/rollback artifacts, and independent reviewer decision to [`docs/evidence/CANARY_RECOVERY_DRILL_TEMPLATE.md`](../../docs/evidence/CANARY_RECOVERY_DRILL_TEMPLATE.md). A unit test or configuration report is not an RTO/RPO measurement.
