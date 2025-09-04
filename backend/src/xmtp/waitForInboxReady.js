import { Client } from '@xmtp/node-sdk';
import { logger } from '../logger.js';

const XMTP_ENV = process.env.XMTP_ENV || 'dev';

// Linearize: wait until the target inbox is visible on the XMTP network
export async function waitForInboxReady(inboxId, tries = 60) {
  const id = String(inboxId || '').replace(/^0x/i, '');
  if (!id) return false;
  // Only attempt in known XMTP envs; otherwise, skip
  if (!['local', 'dev', 'production'].includes(XMTP_ENV)) return true;
  // In test/mocked environments, don't block on network checks
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_XMTP_WAIT === '1') return true;
  // If the static helper is not available (older SDK or mock), skip waiting
  if (typeof Client.inboxStateFromInboxIds !== 'function') return true;
  for (let i = 0; i < tries; i++) {
    try {
      if (typeof Client.inboxStateFromInboxIds === 'function') {
        const envOpt = /** @type {any} */ (
          ['local', 'dev', 'production'].includes(XMTP_ENV) ? XMTP_ENV : 'dev'
        );
        const states = await Client.inboxStateFromInboxIds([id], envOpt);
        logger.info({ inboxId: id, states }, 'Inbox states (inboxStateFromInboxIds)');
        if (Array.isArray(states) && states.length > 0) return true;
      }
    } catch (e) {
      logger.debug({ err: String(e?.message || e), inboxId: id }, 'Inbox state check failed');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
