import { useEffect, useState } from 'react';

const INITIAL_STATE = {
  status: 'loading',
  isMiniApp: false,
  sdk: null,
  capabilities: [],
  error: null
};

export function useMiniAppHost() {
  const [state, setState] = useState(() => INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (typeof window === 'undefined') {
        if (!cancelled) {
          setState({
            status: 'ready',
            isMiniApp: false,
            sdk: null,
            capabilities: [],
            error: null
          });
        }
        return;
      }

      try {
        const imported = await import('@farcaster/miniapp-sdk');
        const sdk = /** @type {import('@farcaster/miniapp-sdk').default} */ (imported.default ?? imported.sdk ?? imported);
        if (!sdk || typeof sdk.isInMiniApp !== 'function') {
          if (!cancelled) {
            setState({
              status: 'ready',
              isMiniApp: false,
              sdk: null,
              capabilities: [],
              error: null
            });
          }
          return;
        }

        const inMiniApp = await sdk.isInMiniApp().catch(() => false);
        if (cancelled) return;
        if (!inMiniApp) {
          setState({
            status: 'ready',
            isMiniApp: false,
            sdk: null,
            capabilities: [],
            error: null
          });
          return;
        }

        try {
          if (sdk?.actions?.ready) {
            await sdk.actions.ready();
          }
        } catch {}

        let capabilities = [];
        try {
          if (typeof sdk?.getCapabilities === 'function') {
            capabilities = await sdk.getCapabilities();
          }
        } catch {}

        if (!cancelled) {
          setState({
            status: 'ready',
            isMiniApp: true,
            sdk,
            capabilities,
            error: null
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            isMiniApp: false,
            sdk: null,
            capabilities: [],
            error: error instanceof Error ? error : new Error(String(error))
          });
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
