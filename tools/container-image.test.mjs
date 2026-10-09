import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const workflowJob = (workflow, name) => workflow.match(new RegExp(`(?:^|\\n)[ ]{2}${name}:\\n([\\s\\S]*?)(?=\\n[ ]{2}[a-z][a-z0-9-]*:\\n|$)`))?.[1] || '';

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

  it('builds the Dockerfile on CI branches without publishing or requiring registry credentials', () => {
    const workflow = read('.github/workflows/ci.yml');
    const imageBuildJob = workflow.match(/(?:^|\n)[ ]{2}container-image-build:\n([\s\S]*?)(?=\n[ ]{2}[a-z][a-z0-9-]*:\n|$)/)?.[1] || '';
    assert.ok(imageBuildJob, 'missing non-publishing OCI build job in required CI');
    assert.match(imageBuildJob, /docker\/build-push-action@v6/);
    assert.match(imageBuildJob, /push:\s*false/);
    assert.match(imageBuildJob, /startsWith\(github\.ref, 'refs\/heads\/arena\/'\)/);
    assert.doesNotMatch(imageBuildJob, /docker\/login-action|packages:\s*write|kubectl|argo\s+rollouts\s+promote/i);
  });

  it('validates stable tags and builds the release candidate without publish permissions', () => {
    const workflow = read('.github/workflows/container-image.yml');
    const validateJob = workflowJob(workflow, 'validate');
    assert.ok(validateJob, 'missing no-publish validation job');
    assert.match(workflow, /tags:\s*\n\s*- 'v\*'/);
    assert.match(validateJob, /stable release tag and merged source commit/);
    assert.match(validateJob, /RELEASE_TAG.*=~.*\^v\(/);
    assert.match(validateJob, /git merge-base --is-ancestor/);
    assert.match(validateJob, /push:\s*false/);
    assert.doesNotMatch(validateJob, /packages:\s*write|docker\/login-action/);
  });

  it('requires a protected reviewer-approved environment and digest-pinned base before publishing', () => {
    const workflow = read('.github/workflows/container-image.yml');
    const publishJob = workflowJob(workflow, 'publish');
    assert.ok(publishJob, 'missing separately permissioned publishing job');
    assert.match(publishJob, /vars\.OCI_RELEASE_ENABLED == '1'/);
    assert.match(publishJob, /name:\s+oci-release/);
    assert.match(publishJob, /deployments:\s*read/);
    assert.match(publishJob, /required_reviewers/);
    assert.match(publishJob, /prevent_self_review === true/);
    assert.match(publishJob, /policy\.type === 'tag' && policy\.name === 'v\*'/);
    assert.match(publishJob, /bookworm-slim@sha256:\[a-f0-9\]\{64\}/);
    assert.match(publishJob, /push:\s*true/);
    assert.match(publishJob, /cosign sign --yes/);
    assert.match(publishJob, /actions\/attest-build-provenance@/);
    assert.match(publishJob, /upload-artifact@v4/);
    assert.match(publishJob, /create-release-evidence\.mjs/);
    assert.doesNotMatch(publishJob, /kubectl|argo rollouts promote|kubectl apply/i);
  });
});
