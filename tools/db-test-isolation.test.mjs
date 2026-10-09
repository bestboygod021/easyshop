import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_TESTS = path.join(ROOT, 'server/test');
const APP_DATABASE = path.join(ROOT, 'server/src/db/index.js');
const MODULE_SPECIFIER = /\b(?:from|import|export)\s*(?:\(\s*)?['"]([^'"]+)['"]/g;

function importsFrom(source) {
  return [...source.matchAll(MODULE_SPECIFIER)].map((match) => match[1]);
}

function resolveLocalModule(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const candidate = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    candidate,
    `${candidate}.js`,
    `${candidate}.mjs`,
    `${candidate}.cjs`,
    path.join(candidate, 'index.js'),
  ];
  return candidates.find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile()) || null;
}

function reachesApplicationDatabase(entry, seen = new Set()) {
  const absoluteEntry = path.resolve(entry);
  if (absoluteEntry === APP_DATABASE) return true;
  if (seen.has(absoluteEntry)) return false;
  seen.add(absoluteEntry);

  const source = fs.readFileSync(absoluteEntry, 'utf8');
  return importsFrom(source)
    .map((specifier) => resolveLocalModule(absoluteEntry, specifier))
    .filter(Boolean)
    .some((dependency) => reachesApplicationDatabase(dependency, seen));
}

function ownsIsolatedDatabase(source) {
  return source.includes("import './isolated-seed.js';")
    || /process\.env\.DATA_DIR\s*=/.test(source);
}

describe('server test database isolation contract', () => {
  it('requires every test reaching the application SQLite database to own an isolated DATA_DIR', () => {
    const testFiles = fs.readdirSync(SERVER_TESTS)
      .filter((file) => file.endsWith('.test.js'))
      .map((file) => path.join(SERVER_TESTS, file));
    const unisolated = testFiles.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return reachesApplicationDatabase(file) && !ownsIsolatedDatabase(source);
    }).map((file) => path.relative(ROOT, file));

    assert.deepEqual(unisolated, [], `Application database tests need an isolated fixture: ${unisolated.join(', ')}`);
  });
});
