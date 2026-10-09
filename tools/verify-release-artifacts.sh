#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <directory-containing-release-assets>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
[[ -d "$1" ]] || { echo "Release asset directory not found." >&2; exit 2; }

release_dir="$(cd -- "$1" && pwd -P)"
repo='bestboygod021/easyshop'
identity='^https://github[.]com/bestboygod021/easyshop/[.]github/workflows/sign-release[.]yml@refs/tags/[^/]+$'
issuer='https://token.actions.githubusercontent.com'

command -v cosign >/dev/null 2>&1 || { echo "cosign is required." >&2; exit 2; }
command -v gh >/dev/null 2>&1 || { echo "GitHub CLI (gh) is required." >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required to validate CycloneDX SBOMs." >&2; exit 2; }

shopt -s nullglob
executables=("$release_dir"/*.exe)
sboms=("$release_dir"/*.cdx.json)
(( ${#executables[@]} > 0 )) || { echo "No Windows executable release assets found." >&2; exit 1; }
(( ${#sboms[@]} > 0 )) || { echo "No CycloneDX SBOM assets found." >&2; exit 1; }

for sbom in "${sboms[@]}"; do
  node --input-type=module - "$sbom" <<'NODE'
import fs from 'node:fs';
const file = process.argv[2];
const bom = JSON.parse(fs.readFileSync(file, 'utf8'));
if (bom.bomFormat !== 'CycloneDX' || !/^1\.[0-9]+$/.test(String(bom.specVersion || '')) || !Array.isArray(bom.components)) {
  throw new Error(`Invalid CycloneDX SBOM: ${file}`);
}
if (bom.components.length === 0) throw new Error(`CycloneDX SBOM has no components: ${file}`);
console.log(`Validated ${file}: ${bom.components.length} components.`);
NODE
done

for artifact in "${executables[@]}"; do
  bundle="${artifact}.sigstore.json"
  [[ -f "$bundle" && ! -L "$bundle" ]] || { echo "Sigstore bundle missing for $(basename "$artifact")." >&2; exit 1; }

  echo "Verifying Sigstore signature: $(basename "$artifact")"
  cosign verify-blob \
    --bundle "$bundle" \
    --certificate-identity-regexp "$identity" \
    --certificate-oidc-issuer "$issuer" \
    "$artifact"

  echo "Verifying GitHub provenance attestation: $(basename "$artifact")"
  gh attestation verify "$artifact" --repo "$repo"
done

echo "Release artifact verification passed: ${#executables[@]} executable(s), ${#sboms[@]} CycloneDX SBOM(s)."
