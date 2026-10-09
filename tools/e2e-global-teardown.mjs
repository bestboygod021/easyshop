import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export default async function globalTeardown() {
  const candidate = process.env.E2E_DATA_DIR;
  if (!candidate) return;
  const resolved = path.resolve(candidate);
  const tempRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${tempRoot}${path.sep}easyshop-e2e-`)) {
    throw new Error('Refusing to remove a Playwright data directory outside the EasyShop test temp area.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}
