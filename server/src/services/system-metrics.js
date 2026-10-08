import os from 'node:os';

/**
 * اندازه‌گیری سلامت عمیق، تأخیر Event Loop و مصرف منابع سرور
 */

export function getSystemResourceMetrics() {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    uptime_seconds: Math.floor(uptime),
    memory: {
      rss_mb: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
      heap_used_mb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      heap_total_mb: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
      system_free_mb: Math.round((freeMem / 1024 / 1024) * 100) / 100,
      system_total_mb: Math.round((totalMem / 1024 / 1024) * 100) / 100,
      system_used_pct: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || 'Generic CPU',
      loadavg: os.loadavg(),
    },
    process: {
      pid: process.pid,
      node_version: process.version,
    },
    status: memUsage.heapUsed / memUsage.heapTotal > 0.9 ? 'degraded' : 'healthy',
  };
}

/**
 * ارزیابی تأخیر حلقه رویداد (Event Loop Lag)
 * @returns {Promise<number>} تأخیر بر حسب میلی‌ثانیه
 */
export function measureEventLoopLag() {
  return new Promise((resolve) => {
    const start = hrtimeMs();
    setImmediate(() => {
      const lag = hrtimeMs() - start;
      resolve(Math.round(lag * 100) / 100);
    });
  });
}

function hrtimeMs() {
  const [sec, nsec] = process.hrtime();
  return sec * 1000 + nsec / 1e6;
}
