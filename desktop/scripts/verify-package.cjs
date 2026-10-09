const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const unpackedDir = process.platform === 'win32'
  ? 'win-unpacked'
  : process.platform === 'darwin' ? 'mac' : 'linux-unpacked';
const resources = path.join(desktopRoot, 'release', unpackedDir, 'resources');

for (const file of [
  path.join(resources, 'server', 'src', 'index.js'),
  path.join(resources, 'server', 'node_modules', 'express', 'package.json'),
  path.join(resources, 'web', 'dist', 'index.html'),
]) {
  assert.ok(fs.existsSync(file), `Packaged runtime is missing ${path.relative(desktopRoot, file)}`);
}

console.info(`Electron package smoke check passed (${unpackedDir}): server source, production dependencies, and web build are present.`);
