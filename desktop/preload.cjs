/**
 * پل امن بین محیط بومی و رابط وب.
 * فقط اطلاعات نسخه/پلتفرم و لاگ سرور در اختیار صفحه قرار می‌گیرد.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyshopDesktop', {
  isDesktop: true,
  platform: process.platform,
  info: () => ipcRenderer.invoke('easyshop:info'),
  serverLogs: () => ipcRenderer.invoke('easyshop:logs'),
});
