# Canary rollback and recovery drill evidence

> **Template only.** Current status: `NOT_RUN`. No Kubernetes cluster, traffic router, staging database, or recovery target is connected to this workspace. Do not report RTO/RPO as measured until all evidence is attached.

## Run identity

- Status: `NOT_RUN`
- Environment and Kubernetes cluster ID:
- Release / immutable OCI image digest:
- Argo Rollouts / ingress-nginx / Prometheus versions:
- Start/end time (UTC):
- Change ticket and operator:
- Independent reviewer (name, organization, role): `PENDING`

## Recovery targets

- Approved RTO target (seconds): `3600` (proposal; owner approval required)
- Approved RPO target (seconds): `300` (proposal; owner approval required)
- Service owner / approval reference:

## Event timeline (UTC)

| Event | Timestamp | Evidence reference |
|---|---|---|
| Fault injection / first customer-impact signal | | |
| Alert fired and acknowledged | | |
| Argo AnalysisRun failed | | |
| Rollout aborted / rollback began | | |
| Stable traffic restored | | |
| Datastore restore/recovery completed | | |
| Order/payment reconciliation completed | | |

- Measured RTO = `stable durable service restored - customer impact began`:
- Latest durable commit present after recovery:
- Incident/data-loss reference time:
- Measured RPO = `incident time - latest durable commit present after recovery`:

## Canary evidence

- NGINX stable/canary weights before, during, and after:
- AnalysisRun YAML/status and Prometheus query outputs:
- Probe / error-rate / p95 observations:
- Rollout revision and stable ReplicaSet after abort:
- Synthetic order/payment invariant checks (IDs redacted):
- Relevant logs/events and checksums:

## Recovery and decision

- Backup manifest and SHA-256:
- Restore integrity output:
- Reconciled order/payment/wallet totals:
- Data loss, if any, and customer-impact assessment:
- Findings/severity/owner/remediation:
- Independent reviewer decision: `PENDING`
- Reviewer sign-off timestamp (UTC):
- Release authorization: `PENDING`

Do not attach credentials, customer PII, card data, bearer tokens, raw database URLs, or unredacted backups to this report.
