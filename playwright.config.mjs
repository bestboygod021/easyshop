import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const e2eDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easyshop-e2e-'));
process.env.E2E_DATA_DIR = e2eDataDir;

export default defineConfig({
  testDir: './web/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  globalTeardown: './tools/e2e-global-teardown.mjs',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5178',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      HOST: '0.0.0.0',
      PORT: '4408',
      WEB_PORT: '5178',
      API_URL: 'http://127.0.0.1:4408',
      DATA_DIR: path.join(e2eDataDir, 'data'),
      UPLOAD_DIR: path.join(e2eDataDir, 'uploads'),
      SECRETS_DIR: path.join(e2eDataDir, 'secrets'),
      SEED_DEMO_DATA: '1',
      JWT_SECRET: 'easyshop-playwright-test-jwt-secret-not-for-production',
      AI_KEY_ENCRYPTION_KEY: 'easyshop-playwright-test-key-material-over-32-bytes',
      PAYMENT_PROVIDER: 'mock',
      PAYMENT_PROVIDERS: 'mock',
      PAYMENT_ALLOW_MOCK: '1',
      LOG_LEVEL: 'error',
    },
  },
});
