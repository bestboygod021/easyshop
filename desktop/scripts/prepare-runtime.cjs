const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const desktopRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(desktopRoot, '..');
const sourceServer = path.join(repositoryRoot, 'server');
const stagedServer = path.join(desktopRoot, 'runtime', 'server');

if (!fs.existsSync(path.join(repositoryRoot, 'web', 'dist', 'index.html'))) {
  throw new Error('Build the web app first (npm run build) before packaging the desktop app.');
}

fs.rmSync(path.join(desktopRoot, 'runtime'), { recursive: true, force: true });
fs.mkdirSync(stagedServer, { recursive: true });
fs.cpSync(path.join(sourceServer, 'src'), path.join(stagedServer, 'src'), { recursive: true });
fs.copyFileSync(path.join(sourceServer, 'package.json'), path.join(stagedServer, 'package.json'));

const serverLock = path.join(sourceServer, 'package-lock.json');
if (fs.existsSync(serverLock)) fs.copyFileSync(serverLock, path.join(stagedServer, 'package-lock.json'));

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const installArgs = fs.existsSync(path.join(stagedServer, 'package-lock.json'))
  ? ['ci', '--omit=dev', '--no-audit', '--no-fund']
  : ['install', '--omit=dev', '--no-audit', '--no-fund'];
const install = spawnSync(npm, installArgs, {
  cwd: stagedServer,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (install.error) throw install.error;
if (install.status !== 0) throw new Error(`Installing packaged server dependencies failed (exit ${install.status}).`);

console.info('Prepared isolated production server runtime for Electron packaging.');
