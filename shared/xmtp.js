// @ts-check

// XMTP utility helpers shared across frontend, backend, and tests

import { waitFor } from './xmtp-wait.js';
import { isTemplDebugEnabled, isTemplE2EDebug } from './debug.js';

// Minimal debug logger usable in both browser and Node environments
const __isDebug = isTemplDebugEnabled();
const dlog = (...args) => { if (__isDebug) { try { console.log(...args); } catch {} } };

/**
 * Synchronize XMTP conversations and preferences with optional retries.
 * @param {any} xmtp XMTP client
 * @param {number} [retries=1] Number of attempts
 * @param {number} [delayMs=1000] Delay between attempts in ms
 */
export async function syncXMTP(xmtp, retries = 1, delayMs = 1000) {
  // In e2e fast mode, avoid long retries
  if (isTemplE2EDebug()) {
    retries = Math.max(retries, 4);
    delayMs = Math.max(delayMs, 200);
  }
  for (let i = 0; i < retries; i++) {
    try { await xmtp?.conversations?.sync?.(); } catch (err) {
      dlog('conversations.sync failed:', err?.message || String(err));
    }
    try { await xmtp?.preferences?.sync?.(); } catch (err) {
      dlog('preferences.sync failed:', err?.message || String(err));
    }
    try { await xmtp?.conversations?.syncAll?.(['allowed','unknown','denied']); } catch (err) {
      dlog('conversations.syncAll failed:', err?.message || String(err));
    }
    if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs));
  }
}

/**
 * Wait for a conversation by ID, syncing XMTP between attempts.
 * @param {object} params
 * @param {any} params.xmtp XMTP client
 * @param {string} params.groupId Conversation ID to search for
 * @param {number} [params.retries=60] Number of attempts
 * @param {number} [params.delayMs=1000] Delay between attempts in ms
 * @returns {Promise<any|null>} Conversation if found, else null
 */
export async function waitForConversation({ xmtp, groupId, retries = 60, delayMs = 1000 }) {
  // Fast mode for tests/dev
  if (isTemplE2EDebug()) {
    retries = Math.max(retries, 15);
    delayMs = Math.max(delayMs, 500);
  }
  const norm = (id) => (id || '').toString();
  const wantedRaw = norm(groupId);
  const wantedNo0x = wantedRaw.replace(/^0x/i, '');
  const wanted0x = wantedRaw.startsWith('0x') ? wantedRaw : `0x${wantedNo0x}`;
  const wantedLower = wantedRaw.toLowerCase();
  const wantedNo0xLower = wantedNo0x.toLowerCase();
  const wanted0xLower = wanted0x.toLowerCase();
  const matches = (candidate) => {
    const cid = String(candidate || '');
    const cidLower = cid.toLowerCase();
    if (cidLower === wantedLower || cidLower === wantedNo0xLower || cidLower === wanted0xLower) return true;
    if (cidLower.replace(/^0x/i, '') === wantedNo0xLower) return true;
    return false;
  };
  const group = await waitFor({
    tries: retries,
    delayMs,
    check: async () => {
      await syncXMTP(xmtp, 2, Math.min(delayMs, 500));
      let conv = null;
      // Try with exact, 0x-prefixed, and non-0x forms for maximum compatibility
      for (const candidate of [wantedRaw, wanted0x, wantedNo0x]) {
        if (conv) break;
        try {
          const maybe = await xmtp?.conversations?.getConversationById?.(candidate);
          if (maybe && matches(maybe.id)) {
            conv = maybe;
          }
        } catch (err) {
          dlog('getConversationById failed:', err?.message || String(err));
        }
      }
      if (!conv) {
        try {
          const conversations = await xmtp?.conversations?.list?.({ consentStates: ['allowed','unknown','denied'], conversationType: 1 /* Group */ }) || [];
          dlog(`Sync attempt: Found ${conversations.length} conversations; firstIds=`, conversations.slice(0,3).map(c => c.id));
          conv = conversations.find((c) => matches(c?.id)) || null;
          if (!conv && typeof xmtp?.conversations?.listGroups === 'function') {
            const groups = await xmtp.conversations.listGroups({ consentStates: ['allowed','unknown','denied'] }) || [];
            dlog(`Sync attempt (groups): Found ${groups.length} groups; firstIds=`, groups.slice(0,3).map(c => c.id));
            conv = groups.find((c) => matches(c?.id)) || null;
          }
        } catch (err) {
          dlog('list conversations failed:', err?.message || String(err));
        }
      }
      if (conv) {
        dlog('Found group:', conv.id, 'consent state:', conv.consentState);
        if (conv.consentState !== 'allowed' && typeof conv.updateConsentState === 'function') {
          try {
            await conv.updateConsentState('allowed');
          } catch (err) {
            dlog('updateConsentState failed:', err?.message || String(err));
          }
        }
        return conv;
      }
      return null;
    }
  });
  return group;
}
