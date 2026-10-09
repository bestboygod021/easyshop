const assert = require('node:assert/strict');

assert.ok(process.versions.electron, 'This smoke test must run inside Electron, not system Node.');
assert.ok(process.versions.node, 'Electron should expose its embedded Node.js runtime.');

const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE runtime_probe (value TEXT NOT NULL)');
db.prepare('INSERT INTO runtime_probe (value) VALUES (?)').run('sqlite-ok');
const row = db.prepare('SELECT value FROM runtime_probe').get();
assert.equal(row.value, 'sqlite-ok');
db.close();

console.info(`Electron runtime smoke check passed (Electron ${process.versions.electron}, Node ${process.versions.node}, node:sqlite).`);
