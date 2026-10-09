# Supply-chain controls

## Locked inputs and dependency review

- `package-lock.json` locks the root and `server`/`web` npm workspaces.
- `desktop/package-lock.json` locks Electron desktop packaging.
- `mobile/package-lock.json` is now committed; do not use `npm install` without updating and reviewing that lock.
- CI runs `npm audit --audit-level=high` against all three dependency trees and GitHub Dependency Review on pull requests. Review transitive changes and licenses before merging; do not apply automatic major upgrades without compatibility tests.
- Known baseline (2026-10-09): the desktop dependency tree reports 8 **moderate** advisories in the `sprintf-js` / `roarr` / `global-agent` / `@electron/get` / `electron-builder` chain. There are no high/critical findings in the `--audit-level=high` check. npm's suggested automatic remediation requires a breaking Electron Builder upgrade, so it was not applied; the advisories are visible (not suppressed) and must be re-evaluated before desktop releases.

Capacitor CLI 6.2.x requests `tar` 6.x, which has published traversal/decompression advisories. `mobile/package.json` scopes a `tar@7.5.22` override to `@capacitor/cli`. This is an intentional cross-major override, not a blanket transitive override: `cap --version`, `cap --help`, a real Android template archive extraction using the same `tar.extract({ file, cwd })` call, `npm audit --prefix mobile` and `npm ci --prefix mobile` have been exercised. `tools/mobile-tooling-smoke.mjs` keeps the archive-compatibility check in CI. Revisit the override when Capacitor ships a compatible patched CLI; keep the smoke test and audit in place until then.

## Secret scanning

CI runs Gitleaks against the complete Git history (checkout uses full depth). `GITLEAKS_LICENSE` is optional for public repositories and should be stored as a GitHub Actions secret if the repository/organization plan requires a Gitleaks license. Never add credentials to allowlists; if a real secret is reported, rotate/revoke it first, then remove the secret from history using the repository incident-response process.

## SBOMs

These commands emit CycloneDX 1.6 JSON from lockfiles, including transitive and development dependencies:

```bash
npm run sbom
npm run sbom:desktop
npm run sbom:mobile
```

Files are written under ignored `artifacts/`. CI uploads the three SBOMs as a 90-day workflow artifact; tagged desktop releases also include workspace and desktop SBOMs alongside installers. Generate the SBOM after lockfile changes and review it with the dependency audit. `--ignore-npm-errors` is used because npm may report platform-inapplicable optional native packages as absent on the current host; the SBOM source remains the committed lockfile, and CI separately runs clean `npm ci` for each locked project.

## Recurring CVE policy and release verification

`npm run supplychain:audit` audits the locked workspace, desktop and mobile graphs and stores machine-readable reports under ignored `artifacts/dependency-audit/`. It fails on high/critical findings or audit execution errors, while keeping moderate/low findings visible. `.github/workflows/dependency-audit.yml` repeats the check weekly and uploads reports for 90 days; CI runs the same policy on changes.

After a desktop release, start `.github/workflows/verify-release.yml` with the release tag. It downloads the executable, Sigstore bundle and CycloneDX files, checks that each BOM is valid/non-empty, verifies the certificate identity and OIDC issuer against this repository's release workflow, then verifies GitHub build provenance. The same local gate is available as `tools/verify-release-artifacts.sh <download-directory>`; it requires `cosign`, `gh` authenticated for the repository, and Node.js. Unit tests mock the external verification CLIs and confirm fail-closed behavior. This workflow has not yet been exercised against a published release.

## API container image

The root `Dockerfile` builds the web assets in a multi-stage Node 22 image and installs only server production dependencies in the non-root runtime (UID/GID 10001). `.dockerignore` excludes environment files, SQLite data, dependencies, and artifacts. CI's `container-image-build` job builds the Dockerfile with `push: false` on pull requests and `arena/*` branch pushes; this no-publish build succeeded in [run 37972968622](https://github.com/bestboygod021/easyshop/actions/runs/37972968622). It does not publish an image or a registry-attached attestation.

The branch-local `.github/workflows/container-image.yml` defines tag-only GHCR publication, BuildKit SBOM/provenance, cosign keyless digest signing, and GitHub build provenance. GitHub currently lists only the CI workflow as active, so the container publication workflow is not active on the default branch. Do not treat it as a release gate until it has been enabled and validated there. Its tagged publication path intentionally fails unless the `NODE_BASE_IMAGE` repository variable contains a reviewed Node 22 Bookworm image reference pinned with `@sha256:<digest>`; the local version-tag default is only for build convenience. No image has been published, no release signature verified, and no staging deployment performed. Do not apply the Kubernetes Rollout until a published immutable digest, verified base digest, PostgreSQL cutover, and platform gates are confirmed.

## Executable signature and provenance

Publishing a GitHub Release triggers `.github/workflows/sign-release.yml` on a Windows runner. It builds the Windows installers, signs each `.exe` using keyless Sigstore/cosign (GitHub OIDC), creates a GitHub build-provenance attestation, and attaches installer, `.sigstore.json` bundle and CycloneDX files to the release.

Verify a downloaded binary and bundle:

```bash
cosign verify-blob \
  --bundle EasyShop-Setup-1.0.0.exe.sigstore.json \
  --certificate-identity-regexp '^https://github.com/bestboygod021/easyshop/.github/workflows/sign-release.yml@refs/tags/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  EasyShop-Setup-1.0.0.exe

gh attestation verify EasyShop-Setup-1.0.0.exe --repo bestboygod021/easyshop
```

Sigstore verifies artifact identity/provenance and detects post-build tampering. It is **not** an Authenticode certificate and does not by itself remove Windows SmartScreen warnings; a publisher certificate is a separate release-signing requirement. macOS notarization/signing is also not configured by this Windows release workflow.
