# Payment sandbox / staging evidence template

> **Template only.** Status for the current workspace is `NOT_RUN`; no real sandbox transaction or independent review has been performed. Do not replace this status with “pass” until artifacts are attached and independently verified. Never attach PAN/CVV, credentials, bearer tokens, or an unredacted `DATABASE_URL`.

## Run identity

- Status: `NOT_RUN`
- Provider and sandbox environment:
- Staging release / commit SHA:
- Test window (UTC):
- Test operator and change/ticket ID:
- Reviewer (name, organization, role): **PENDING**
- Reviewer independence declaration:

## Environment evidence

- Public HTTPS storefront URL:
- Public callback URL and reachability evidence:
- Merchant sandbox account label (not ID/secret):
- TLS certificate/hostname evidence:
- Runtime configuration report with secret values redacted:
- Staging/non-production confirmation by environment owner:

## Test cases and artifacts

| Case | Expected | Result | Evidence reference / checksum | Notes |
|---|---|---|---|---|
| Successful checkout, provider verification, one settlement | exactly one paid order and one ledger credit | NOT_RUN | | |
| Callback delivery repeated / replayed | idempotent response, no second settlement | NOT_RUN | | |
| Invalid/unknown authority | no settlement or wallet credit | NOT_RUN | | |
| Provider amount/currency mismatch | fail closed / manual review; no stock or credit corruption | NOT_RUN | | |
| Delayed callback after expiry/cancellation | manual review and controlled stock/refund handling | NOT_RUN | | |
| Statement reconciliation | exact match plus mismatch/orphan cases reported | NOT_RUN | | |
| Provider timeout and retry | bounded retry, stable idempotency, no duplicate intent | NOT_RUN | | |

## Reconciliation and reviewer decision

- Before/after order/payment/wallet totals (redacted):
- Provider sandbox statement reference and checksum:
- Callback/event log export reference and checksum:
- Findings with severity and owner:
- Remediations and retest references:
- Reviewer decision: `PENDING`
- Reviewer sign-off timestamp (UTC):
- Release authorization (separate from this technical review): `PENDING`

## Current local-only evidence

The repository's `server/test/payments.test.js` uses an in-process mocked gateway `fetch` and exercises callback verification, replay/idempotency, amount mismatch, reconciliation branches, and duplicate-capture refund handling. It is **not** evidence of a provider sandbox, public callback reachability, bank statement match, PCI scope, or reviewer approval. The readiness preflight makes no network requests and can only report `configured_unverified` after an operator supplies non-secret configuration.
