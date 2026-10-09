/**
 * EasyShop Desktop — فرآیند اصلی Electron
 * ------------------------------------------------------------------
 * ۱) سرور فروشگاه (Express + SQLite) را به‌صورت فرزند اجرا می‌کند.
 * ۲) پس از آماده شدن پورت، پنجره‌ی اپلیکیشن را روی وب‌اپ ساخته‌شده باز می‌کند.
 * ۳) در حالت توسعه (EASYSHOP_DEV=1) به Vite روی پورت 5173 وصل می‌شود.
 */
const { app, BrowserWindow, Menu, shell, dialog, Tray, nativeImage, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { fork } = require('node:child_process');
const crypto = require('node:crypto');

const isDev = process.env.EASYSHOP_DEV === '1';
const DEV_URL = process.env.EASYSHOP_DEV_URL || 'http://localhost:5173';
const PORT = Number(process.env.PORT || 4000);
const HOST = '127.0.0.1';
const APP_URL = `http://${HOST}:${PORT}`;

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverLog = [];

/* ------------------------------ سرور داخلی ------------------------------ */
function resolveServerEntry() {
  const candidates = [
    path.join(process.resourcesPath || '', 'server', 'src', 'index.js'), // نسخه بسته‌بندی‌شده
    path.join(__dirname, '..', 'server', 'src', 'index.js'), // اجرای مستقیم از مخزن
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function persistentSecret(filename) {
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  const secretPath = path.join(dataDir, filename);
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (Buffer.byteLength(existing, 'utf8') >= 32) return existing;
  } catch {
    /* create a per-install secret below */
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(secretPath, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

function startServer() {
  const entry = resolveServerEntry();
  if (!entry) {
    dialog.showErrorBox('خطا', 'فایل سرور پیدا نشد. لطفاً پروژه را کامل نصب کنید.');
    return null;
  }
  const cwd = path.dirname(path.dirname(entry)); // پوشه server
  const child = fork(entry, [], {
    cwd,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST,
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
      DATA_DIR: path.join(app.getPath('userData'), 'data'),
      UPLOAD_DIR: path.join(app.getPath('userData'), 'uploads'),
      JWT_SECRET: process.env.JWT_SECRET || persistentSecret('jwt-secret'),
      AI_KEY_ENCRYPTION_KEY: process.env.AI_KEY_ENCRYPTION_KEY || persistentSecret('ai-key-encryption-secret'),
      ALLOW_SELF_PROMOTION: '0',
      SEED_DEMO_DATA: process.env.SEED_DEMO_DATA || '0',
      CORS_ORIGINS: '',
      TRUSTED_ORIGINS: `http://${HOST}:${PORT}`,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout?.on('data', (d) => {
    serverLog.push(String(d));
    if (serverLog.length > 200) serverLog.shift();
  });
  child.stderr?.on('data', (d) => serverLog.push(String(d)));
  child.on('exit', (code) => {
    if (code && code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'توقف سرور',
        message: `سرور فروشگاه با کد ${code} متوقف شد.`,
        detail: serverLog.slice(-10).join(''),
      });
    }
  });
  return child;
}

function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const probe = () => {
      const req = http.get(`${APP_URL}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve(true);
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1200, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(probe, 500);
    };
    probe();
  });
}

/* -------------------------------- پنجره -------------------------------- */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#080c1a',
    title: 'EasyShop — فروشگاه هوشمند',
    icon: path.join(__dirname, 'resources', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  const target = isDev ? DEV_URL : APP_URL;
  mainWindow.loadURL(target);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // لینک‌های بیرونی در مرورگر پیش‌فرض باز شوند
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'فایل',
      submenu: [
        {
          label: 'بارگذاری مجدد',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload(),
        },
        { type: 'separator' },
        { label: 'خروج', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'نمایش',
      submenu: [
        { label: 'بزرگ‌نمایی', role: 'zoomIn' },
        { label: 'کوچک‌نمایی', role: 'zoomOut' },
        { label: 'اندازه عادی', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'تمام‌صفحه', role: 'togglefullscreen' },
        { label: 'ابزار توسعه‌دهنده', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'فروشگاه',
      submenu: [
        { label: 'صفحه اصلی', click: () => mainWindow?.loadURL(`${APP_URL}/`) },
        { label: 'سبد خرید', click: () => mainWindow?.loadURL(`${APP_URL}/cart`) },
        { label: 'سفارش‌های من', click: () => mainWindow?.loadURL(`${APP_URL}/account/orders`) },
        { label: 'پنل مدیریت', click: () => mainWindow?.loadURL(`${APP_URL}/admin`) },
      ],
    },
    {
      label: 'راهنما',
      submenu: [
        {
          label: 'درباره EasyShop',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'درباره EasyShop',
              message: 'EasyShop — فروشگاه چندسکویی',
              detail:
                'نسخه دسکتاپ (ویندوز/مک/لینوکس)\n' +
                'وب، iOS و اندروید نیز از همان بک‌اند استفاده می‌کنند.\n\n' +
                `آدرس سرور داخلی: ${APP_URL}`,
            }),
        },
        { label: 'مشاهده لاگ سرور', click: () => dialog.showMessageBox(mainWindow, { title: 'لاگ سرور', message: serverLog.slice(-25).join('') || 'بدون لاگ' }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const iconPath = path.join(__dirname, 'resources', 'icon.png');
  if (!fs.existsSync(iconPath)) return;
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('EasyShop');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'نمایش فروشگاه', click: () => (mainWindow ? mainWindow.show() : createWindow()) },
      { label: 'بازکردن سبد خرید', click: () => mainWindow?.loadURL(`${APP_URL}/cart`) },
      { type: 'separator' },
      { label: 'خروج', click: () => app.quit() },
    ]),
  );
  tray.on('double-click', () => (mainWindow ? mainWindow.show() : createWindow()));
}

/* ------------------------------- چرخه عمر ------------------------------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (!isDev) {
      serverProcess = startServer();
      const ready = await waitForServer();
      if (!ready) {
        dialog.showMessageBoxSync({
          type: 'warning',
          title: 'تأخیر در راه‌اندازی',
          message: 'سرور داخلی دیر پاسخ داد. اپلیکیشن با تلاش مجدد باز می‌شود.',
          detail: serverLog.slice(-8).join(''),
        });
      }
    }
    buildMenu();
    createWindow();
    createTray();

    ipcMain.handle('easyshop:info', () => ({
      version: app.getVersion(),
      platform: process.platform,
      apiUrl: APP_URL,
      dev: isDev,
    }));
    ipcMain.handle('easyshop:logs', () => serverLog.join(''));
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', () => {
    if (serverProcess && !serverProcess.killed) {
      try {
        serverProcess.kill('SIGTERM');
      } catch {
        /* نادیده */
      }
    }
  });
}
