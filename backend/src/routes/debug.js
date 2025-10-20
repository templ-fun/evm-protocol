import express from 'express';
import { Client as NodeClient } from '@xmtp/node-sdk';
import { resolveXmtpEnv } from '../xmtp/options.js';

export default function debugRouter() {
  const router = express.Router();

  // Lightweight visibility endpoint: returns whether an inbox is visible on the selected XMTP environment
  router.get('/debug/inbox-state', async (req, res) => {
    try {
      const inboxIdRaw = String(req.query.inboxId || '').trim();
      if (!inboxIdRaw) return res.status(400).json({ error: 'inboxId required' });
      const inboxId = inboxIdRaw.replace(/^0x/i, '');
      if (!/^[0-9a-fA-F]+$/.test(inboxId)) return res.status(400).json({ error: 'invalid inboxId' });

      const envParam = String(req.query.env || '').trim();
      const fallbackEnv = resolveXmtpEnv();
      const resolved = /** @type {'local' | 'dev' | 'production'} */ (
        envParam === 'local' || envParam === 'dev' || envParam === 'production'
          ? envParam
          : fallbackEnv === 'local' || fallbackEnv === 'dev' || fallbackEnv === 'production'
            ? fallbackEnv
            : 'dev'
      );

      let states = [];
      try {
        states = await NodeClient.inboxStateFromInboxIds([inboxId], resolved);
      } catch (err) {
        return res.status(502).json({ error: String(err?.message || err), env: resolved });
      }
      const summarized = (Array.isArray(states) ? states : []).map((s) => ({
        identifiers: Array.isArray(s?.identifiers) ? s.identifiers.length : 0,
        installations: Array.isArray(s?.installations) ? s.installations.length : 0
      }));
      res.json({ inboxId, env: resolved, states: summarized });
    } catch (err) {
      res.status(500).json({ error: String(err?.message || err) });
    }
  });

  return router;
}
