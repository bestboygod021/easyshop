import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.resolve(process.env.AUDIT_REPORT_DIR || path.join(ROOT, 'artifacts', 'dependency-audit'));
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const auditTargets = [
  { name: 'workspaces', prefix: [] },
  { name: 'desktop', prefix: ['--prefix', 'desktop'] },
  { name: 'mobile', prefix: ['--prefix', 'mobile'] },
];

fs.mkdirSync(OUTPUT_DIR, { recursive: true, mode: 0o700 });

let policyFailure = false;
for (const target of auditTargets) {
  const args = ['audit', '--json', '--audit-level=high', '--package-lock-only', ...target.prefix];
  const result = spawnSync(npmExecutable, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });

  let report;
  let commandFailure = false;
  try {
    report = JSON.parse(result.stdout || '');
  } catch {
    commandFailure = true;
    report = {
      error: 'npm audit did not return valid JSON',
      status: result.status,
      stderr: String(result.stderr || '').slice(0, 8_000),
      stdout: String(result.stdout || '').slice(0, 8_000),
    };
  }
  if (result.error) {
    commandFailure = true;
    report.execution_error = result.error.message;
  }

  const counts = report?.metadata?.vulnerabilities;
  if (!counts || typeof counts !== 'object') commandFailure = true;
  if (commandFailure) policyFailure = true;

  const reportPath = path.join(OUTPUT_DIR, `${target.name}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

  if (counts) {
    const critical = Number(counts.critical || 0);
    const high = Number(counts.high || 0);
    const moderate = Number(counts.moderate || 0);
    const low = Number(counts.low || 0);
    console.log(`${target.name}: ${critical} critical, ${high} high, ${moderate} moderate, ${low} low — report: ${path.relative(ROOT, reportPath)}`);
    if (critical > 0 || high > 0) policyFailure = true;
  } else {
    console.error(`${target.name}: audit failed; see ${path.relative(ROOT, reportPath)}`);
  }

  if (result.status !== 0 && (!counts || (Number(counts.high || 0) === 0 && Number(counts.critical || 0) === 0))) policyFailure = true;
}

if (policyFailure) {
  console.error('Dependency audit failed: high/critical advisories or an audit execution error was found.');
  process.exitCode = 1;
} else {
  console.log('Dependency audit policy passed (no high/critical advisories). Moderate/low findings remain visible in the reports.');
}
