// @ts-check

const levels = { debug: 10, info: 20, warn: 30, error: 40 };

const debugEnv = (() => {
  try { if (globalThis?.process?.env?.DEBUG_TEMPL === '1') return true; } catch {}
  try {
    // @ts-ignore - Vite injects env
    if (import.meta?.env?.VITE_E2E_DEBUG === '1') return true;
  } catch {}
  return false;
})();

const envLevel = (() => {
  try { return String(globalThis?.process?.env?.LOG_LEVEL || '').toLowerCase(); } catch {}
  try {
    // @ts-ignore
    return String(import.meta?.env?.LOG_LEVEL || '').toLowerCase();
  } catch {}
  return '';
})();

const level = debugEnv ? 'debug' : (levels[envLevel] ? envLevel : 'info');

function enabled(lvl) {
  return levels[lvl] >= levels[level];
}

export const logger = {
  debug: (...args) => { if (enabled('debug')) { try { console.debug(...args); } catch {} } },
  info: (...args) => { if (enabled('info')) { try { console.log(...args); } catch {} } },
  warn: (...args) => { if (enabled('warn')) { try { console.warn(...args); } catch {} } },
  error: (...args) => { if (enabled('error')) { try { console.error(...args); } catch {} } }
};
