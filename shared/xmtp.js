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
export const XMTP_CONSENT_STATES = {
  UNKNOWN: 0,
  ALLOWED: 1,
  DENIED: 2
};

export const XMTP_CONVERSATION_TYPES = {
  DM: 0,
  GROUP: 1,
  SYNC: 2
};

/**
 * Derive the standard templ group name given a contract address.
 * @param {string} [contractAddress]
 * @returns {string}
 */
export function deriveTemplGroupName(contractAddress) {
  if (!contractAddress) return 'templ';
  const raw = String(contractAddress).trim();
  if (!raw) return 'templ';
  const bareHex = /^[0-9a-fA-F]{40}$/;
  const prefixedHex = /^0x[0-9a-fA-F]{40}$/;
  let normalized = raw;
  if (bareHex.test(raw)) {
    normalized = `0x${raw}`;
  }
  if (prefixedHex.test(normalized)) {
    const lower = normalized.toLowerCase();
    const prefix = lower.slice(0, 10);
    return prefix ? `templ:${prefix}` : 'templ';
  }
  const lower = raw.toLowerCase();
  if (lower.startsWith('templ:')) return lower;
  const fallback = lower.startsWith('0x') ? lower.slice(0, 10) : lower.slice(0, Math.min(10, lower.length));
  return fallback ? `templ:${fallback}` : 'templ';
}

export async function syncXMTP(xmtp, retries = 1, delayMs = 1000) {
  // In e2e fast mode, avoid long retries
  if (isTemplE2EDebug()) {
    retries = Math.min(retries, 2);
    delayMs = Math.min(delayMs, 200);
  }

  dlog(`Starting XMTP sync with ${retries} retries and ${delayMs}ms delay`);

  for (let i = 0; i < retries; i++) {
    let successCount = 0;
    let totalCount = 0;

    // Sync conversations
    totalCount++;
    try {
      await xmtp?.conversations?.sync?.();
      successCount++;
      dlog(`Attempt ${i + 1}: conversations.sync succeeded`);
    } catch (err) {
      dlog(`Attempt ${i + 1}: conversations.sync failed:`, err?.message || String(err));
    }

    // Sync preferences
    totalCount++;
    try {
      await xmtp?.preferences?.sync?.();
      successCount++;
      dlog(`Attempt ${i + 1}: preferences.sync succeeded`);
    } catch (err) {
      dlog(`Attempt ${i + 1}: preferences.sync failed:`, err?.message || String(err));
    }

    // Sync all conversations by consent state
    totalCount++;
    try {
      await xmtp?.conversations?.syncAll?.([
        XMTP_CONSENT_STATES.ALLOWED,
        XMTP_CONSENT_STATES.UNKNOWN,
        XMTP_CONSENT_STATES.DENIED
      ]);
      successCount++;
      dlog(`Attempt ${i + 1}: conversations.syncAll succeeded`);
    } catch (err) {
      dlog(`Attempt ${i + 1}: conversations.syncAll failed:`, err?.message || String(err));
    }

    dlog(`Attempt ${i + 1}: ${successCount}/${totalCount} sync operations succeeded`);

    if (i < retries - 1) {
      dlog(`Waiting ${delayMs}ms before next sync attempt`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  dlog('XMTP sync completed');
}

/**
 * Aggregate conversations across conversation types for discovery flows.
 * @param {object} [params]
 * @param {any} [params.xmtp]
 * @param {Array<number|string>} [params.consentStates]
 * @param {Array<'all'|'group'|'sync'>} [params.conversationTypes]
 * @returns {Promise<Array<{ conv: any, tags: string[] }>>}
 */
export async function listConversationCandidates({
  xmtp,
  consentStates,
  conversationTypes = ['all', 'group', 'sync']
} = {}) {
  if (!xmtp?.conversations) return [];
  const resolvedConsentStates = Array.isArray(consentStates) && consentStates.length
    ? consentStates
    : [
        XMTP_CONSENT_STATES.ALLOWED,
        XMTP_CONSENT_STATES.UNKNOWN,
        XMTP_CONSENT_STATES.DENIED
      ];

  const wants = new Set(
    Array.isArray(conversationTypes) && conversationTypes.length
      ? conversationTypes
      : ['all', 'group', 'sync']
  );

  const aggregate = new Map();
  const noteConversation = (tag, conversations) => {
    if (!Array.isArray(conversations)) return;
    for (const item of conversations) {
      if (!item || !item.id) continue;
      const key = String(item.id);
      if (!aggregate.has(key)) {
        aggregate.set(key, { conv: item, tags: new Set([tag]) });
      } else {
        aggregate.get(key).tags.add(tag);
      }
    }
  };

  const listAttempts = [];
  if (wants.has('all')) {
    listAttempts.push({ tag: 'list(all)', options: { consentStates: resolvedConsentStates } });
  }
  if (wants.has('group')) {
    listAttempts.push({
      tag: 'list(group)',
      options: {
        consentStates: resolvedConsentStates,
        conversationType: XMTP_CONVERSATION_TYPES.GROUP
      }
    });
  }
  if (wants.has('sync')) {
    listAttempts.push({
      tag: 'list(sync)',
      options: {
        consentStates: resolvedConsentStates,
        conversationType: XMTP_CONVERSATION_TYPES.SYNC
      }
    });
  }

  for (const attempt of listAttempts) {
    try {
      const conversations = await xmtp.conversations.list?.(attempt.options) || [];
      dlog(`${attempt.tag} returned ${conversations.length} conversations; firstIds=`, conversations.slice(0, 3).map((c) => c.id));
      noteConversation(attempt.tag, conversations);
    } catch (err) {
      dlog(`${attempt.tag} failed:`, err?.message || String(err));
    }
  }

  if (wants.has('group') && typeof xmtp.conversations.listGroups === 'function') {
    try {
      const groups = await xmtp.conversations.listGroups({ consentStates: resolvedConsentStates });
      dlog('listGroups returned', groups.length, 'conversations; firstIds=', groups.slice(0, 3).map((c) => c.id));
      noteConversation('listGroups', groups);
    } catch (err) {
      dlog('listGroups failed:', err?.message || String(err));
    }
  }

  const aggregated = Array.from(aggregate.values()).map(({ conv, tags }) => ({
    conv,
    tags: Array.from(tags)
  }));

  if (aggregated.length) {
    const preview = aggregated.slice(0, 5).map(({ conv, tags }) => `${conv.id}[${tags.join('+')}]::${conv?.name || ''}`);
    dlog('Aggregated conversation candidates:', preview);
  }

  return aggregated;
}

/**
 * Wait for a conversation by ID, syncing XMTP between attempts.
 * @param {object} params
 * @param {any} params.xmtp XMTP client
 * @param {string} params.groupId Conversation ID to search for
 * @param {number} [params.retries=60] Number of attempts
 * @param {number} [params.delayMs=1000] Delay between attempts in ms
 * @param {string} [params.expectedName] Optional fallback group name to match
 * @returns {Promise<any|null>} Conversation if found, else null
 */
export async function waitForConversation({ xmtp, groupId, retries = 60, delayMs = 1000, expectedName = '' }) {
  // Fast mode for tests/dev
  if (isTemplE2EDebug()) {
    retries = Math.min(retries, 5);
    delayMs = Math.min(delayMs, 200);
  }

  dlog(`Waiting for conversation ${groupId} with ${retries} retries and ${delayMs}ms delay`);

  const normaliseId = (value) => {
    const raw = (value ?? '').toString().trim();
    const lower = raw.toLowerCase();
    const no0x = lower.replace(/^0x/i, '');
    return { raw, lower, no0x, prefixedLower: lower.startsWith('0x') ? lower : `0x${no0x}` };
  };
  const idsMatch = (candidate, target) => {
    const a = normaliseId(candidate);
    const b = normaliseId(target);
    if (!a.lower || !b.lower) return false;
    return (
      a.lower === b.lower ||
      a.no0x === b.no0x ||
      a.prefixedLower === b.lower ||
      a.lower === b.prefixedLower
    );
  };

  const wanted = normaliseId(groupId);
  const candidateIds = Array.from(new Set([
    wanted.raw,
    wanted.lower,
    wanted.prefixedLower,
    wanted.no0x,
    wanted.no0x ? `0x${wanted.no0x}` : null
  ].filter(Boolean)));

  dlog(`Looking for group conversation with candidate IDs:`, candidateIds);

  const group = await waitFor({
    tries: retries,
    delayMs,
    check: async () => {
      await syncXMTP(xmtp);
      let conv = null;
      let usedMethod = '';
      const consentFilters = [
        XMTP_CONSENT_STATES.ALLOWED,
        XMTP_CONSENT_STATES.UNKNOWN,
        XMTP_CONSENT_STATES.DENIED
      ];
      const targetName = (expectedName || '').toString().trim().toLowerCase();

      // Try with exact, 0x-prefixed, and non-0x forms for maximum compatibility
      for (const candidate of candidateIds) {
        if (conv) break;
        usedMethod = `getConversationById(${candidate})`;
        try {
          conv = await xmtp?.conversations?.getConversationById?.(candidate);
          if (conv) {
            dlog(`Found conversation via ${usedMethod}:`, conv.id);
          }
        } catch (err) {
          dlog(`getConversationById(${candidate}) failed:`, err?.message || String(err));
        }
      }

      if (!conv) {
        try {
          const aggregated = await listConversationCandidates({
            xmtp,
            consentStates: consentFilters
          });

          const matchById = aggregated.find(({ conv: candidate }) => idsMatch(candidate?.id, groupId));
          if (matchById) {
            conv = matchById.conv;
            usedMethod = `aggregate:${(matchById.tags || []).join('+') || 'list'}`;
            dlog(`Found conversation via aggregated lists (${usedMethod}):`, conv.id);
          } else if (targetName) {
            const normaliseName = (value) => (value ?? '').toString().trim().toLowerCase();
            const matchedByName = aggregated.find(({ conv: candidate }) => normaliseName(candidate?.name) === targetName);
            if (matchedByName) {
              conv = matchedByName.conv;
              usedMethod = `name:${(matchedByName.tags || []).join('+') || 'list'}`;
              dlog(`Found conversation via name match (${usedMethod}):`, conv.id, 'name=', conv.name);
            } else {
              // As a last resort, invoke metadata for each candidate and compare creator + name together.
              for (const entry of aggregated) {
                if (conv) break;
                const candidate = entry.conv;
                if (!candidate || typeof candidate.metadata !== 'function') continue;
                try {
                  const meta = await candidate.metadata();
                  const metaName = (meta?.conversationType ? candidate?.name : candidate?.name) || '';
                  if (normaliseName(metaName) === targetName) {
                    conv = candidate;
                    usedMethod = `metadata-name:${(entry.tags || []).join('+') || 'list'}`;
                    dlog(`Found conversation via metadata name (${usedMethod}):`, conv.id, 'name=', candidate?.name);
                    break;
                  }
                } catch (errMeta) {
                  dlog('metadata lookup failed during name match:', errMeta?.message || String(errMeta));
                }
              }
            }
          }
        } catch (err) {
          dlog('listConversationCandidates failed:', err?.message || String(err));
        }
      }

      if (conv) {
        let consentStateValue;
        try {
          if (typeof conv?.consentState === 'function') {
            consentStateValue = await conv.consentState();
          } else {
            consentStateValue = conv?.consentState;
          }
        } catch (err) {
          dlog('Failed to read consent state:', err?.message || String(err));
        }

        dlog(`Found group ${conv.id} via ${usedMethod}, consent state:`, consentStateValue);

        const consentLabel = typeof consentStateValue === 'string'
          ? consentStateValue.toLowerCase()
          : String(consentStateValue ?? '').toLowerCase();

        const isAllowed =
          consentStateValue === XMTP_CONSENT_STATES.ALLOWED ||
          consentLabel === 'allowed';

        if (!isAllowed && typeof conv?.updateConsentState === 'function') {
          const targetLabel = 'allowed';
          const targetEnum = XMTP_CONSENT_STATES.ALLOWED;
          dlog(`Updating consent state from '${consentStateValue}' to '${targetLabel}' for conversation ${conv.id}`);
          try {
            await conv.updateConsentState(targetEnum);
            dlog('Successfully updated consent state');
          } catch (err) {
            const message = err?.message || String(err);
            dlog('updateConsentState failed:', message);
            try {
              await conv.updateConsentState(targetLabel);
              dlog('Successfully updated consent state using string fallback');
            } catch (fallbackErr) {
              dlog('updateConsentState fallback failed:', fallbackErr?.message || String(fallbackErr));
            }
          }
        }

        return conv;
      }

      dlog(`Conversation ${groupId} not found in this attempt, will retry`);
      return null;
    },
    onError: (err) => {
      dlog('waitForConversation check failed:', err?.message || String(err));
    }
  });

  if (group) {
    dlog(`Successfully found and verified conversation ${group.id}`);
  } else {
    dlog(`Failed to find conversation ${groupId} after ${retries} attempts`);
  }

  return group;
}
