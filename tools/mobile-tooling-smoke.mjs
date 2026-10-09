import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const tar = require(path.join(root, 'mobile/node_modules/tar'));
const tarPackage = require(path.join(root, 'mobile/node_modules/tar/package.json'));
const template = path.join(root, 'mobile/node_modules/@capacitor/cli/assets/android-template.tar.gz');
const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-capacitor-template-'));

try {
  await tar.extract({ file: template, cwd: destination });
  const entries = fs.readdirSync(destination);
  assert.ok(entries.length > 0, 'Capacitor Android template archive should extract successfully');
  console.log(`Capacitor tar smoke test passed (tar ${tarPackage.version}, ${entries.length} template entries).`);
} finally {
  fs.rmSync(destination, { recursive: true, force: true });
}
