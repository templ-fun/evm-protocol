// @ts-check

// Minimal debug logger usable in both browser and Node tests
export const isDebug = (() => {
  // Node tests: opt-in via DEBUG_TEMPL=1
  try { if (globalThis?.process?.env?.DEBUG_TEMPL === '1') return true; } catch {}
  // Browser (Vite): import.meta.env.VITE_E2E_DEBUG — typed loosely to appease TS in JS files
  try {
    // @ts-ignore - vite injects env on import.meta at build time
    const env = import.meta?.env;
    if (env?.VITE_E2E_DEBUG === '1') return true;
  } catch {}
  return false;
})();

export const dlog = (...args) => { if (isDebug) { try { console.log(...args); } catch {} } };
