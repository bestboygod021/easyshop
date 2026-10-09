import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('production OCI image contract', () => {
  it('uses a minimal multi-stage build and a non-root runtime matching the Rollout UID', () => {
    const dockerfile = read('Dockerfile');
    const runtime = dockerfile.split('AS runtime', 2)[1];
    assert.match(dockerfile, /FROM \$\{NODE_BASE_IMAGE\} AS build/);
    assert.match(dockerfile, /RUN npm ci\s+COPY \. \.\s+RUN npm run build/s);
    assert.ok(runtime);
    assert.doesNotMatch(runtime, /COPY \. \.|COPY --from=build .*\/test\//);
    assert.match(runtime, /npm ci --omit=dev --workspace @easyshop\/server --include-workspace-root=false/);
    assert.match(runtime, /USER 10001:10001/);
    assert.match(runtime, /CMD \["node", "server\/src\/index\.js"\]/);
  });

  it('excludes credentials, SQLite data, dependencies, and generated artifacts from the image context', () => {
    const dockerignore = read('.dockerignore');
    for (const required of ['.git', '**/node_modules', '**/.env', '**/.env.*', 'server/data', 'artifacts']) {
      assert.ok(dockerignore.split(/\r?\n/).includes(required), `missing .dockerignore entry: ${required}`);
    }
    assert.match(dockerignore, /!\*\*\/\.env\.example/);
  });

  it('only publishes tagged images, requires a digest-pinned base, and signs the image digest', () => {
    const workflow = read('.github/workflows/container-image.yml');
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /tags:\s*\n\s*- 'v\*'/);
    assert.match(workflow, /refs\/tags\/v/);
    assert.match(workflow, /@sha256:\[a-f0-9\]\{64\}/);
    assert.match(workflow, /sbom: true/);
    assert.match(workflow, /provenance: mode=max/);
    assert.match(workflow, /cosign sign --yes/);
    assert.match(workflow, /actions\/attest-build-provenance@/);
    assert.doesNotMatch(workflow, /kubectl|argo rollouts promote|kubectl apply/i);
  });
});
