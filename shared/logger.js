// @ts-check

// Minimal cross-environment logger. Uses `console` in both Node and browser
// environments and exposes debug/info/warn/error methods. Debug logs are
// enabled when `DEBUG_TEMPL=1` or `VITE_E2E_DEBUG=1` is set in the environment.

const isDebug = (() => {
  try {
    if (globalThis?.process?.env?.DEBUG_TEMPL === '1') return true;
  } catch {}
  try {
    // @ts-ignore - Vite injects env at build time
    const env = import.meta?.env;
    if (env?.VITE_E2E_DEBUG === '1') return true;
  } catch {}
  return false;
})();

const fallback = () => {};
const c = typeof console !== 'undefined'
  ? console
  : { debug: fallback, info: fallback, warn: fallback, error: fallback };

export const logger = {
  debug: isDebug ? c.debug.bind(c) : fallback,
  info: c.info.bind(c),
  warn: c.warn.bind(c),
  error: c.error.bind(c)
};
