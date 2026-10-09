import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-ci-fixture-'));
process.env.DATA_DIR = path.join(tempDir, 'data');
process.env.UPLOAD_DIR = path.join(tempDir, 'uploads');
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = '1';
process.env.LOG_LEVEL = 'error';

const { db } = await import('../src/db/index.js');
const { runSeed } = await import('../src/db/seed.js');
runSeed();

after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
