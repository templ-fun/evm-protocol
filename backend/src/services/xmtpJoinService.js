import { Client as NodeXmtpClient, generateInboxId, getInboxIdForIdentifier } from '@xmtp/node-sdk';
import { waitForInboxReady } from '../xmtp/index.js';
import { syncXMTP } from '../../../shared/xmtp.js';
import {
  resolveXmtpEnv,
  isFastEnv,
  allowDeterministicInbox,
  shouldVerifyContracts
} from '../xmtp/options.js';
import { ensureContractDeployed } from './contractValidation.js';
import { logger } from '../logger.js';

function templError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function normaliseHex(value) {
  return String(value || '').replace(/^0x/i, '').toLowerCase();
}

async function getGroupMemberIds(group, logger) {
  if (!group) return [];
  try {
    if (typeof group.sync === 'function') {
      try { await group.sync(); } catch {/* ignore sync errors */ }
    }
    const rawMembers = typeof group.members === 'function'
      ? await group.members()
      : Array.isArray(group.members) ? group.members : [];
    return rawMembers
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === 'string') return normaliseHex(entry);
        if (typeof entry === 'object') {
          if (entry.inboxId) return normaliseHex(entry.inboxId);
          if (entry.inbox_id) return normaliseHex(entry.inbox_id);
        }
        return null;
      })
      .filter(Boolean);
  } catch (err) {
    logger?.debug?.({
      err: err?.message || err,
      groupId: group?.id
    }, 'Failed to enumerate group members');
    return [];
  }
}

function parseProvidedInboxId(value) {
  try {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^[0-9a-fA-F]+$/i.test(raw)) {
      return raw.replace(/^0x/i, '');
    }
  } catch {/* ignore */}
  return null;
}

async function hydrateGroup(record, { ensureGroup, xmtp, logger }) {
  try {
    if (!record.group && typeof ensureGroup === 'function') {
      record.group = await ensureGroup(record);
    }
    if (!record.group && record.groupId && xmtp?.conversations?.getConversationById) {
      const maybe = await xmtp.conversations.getConversationById(record.groupId);
      if (maybe) {
        record.group = maybe;
      }
    }
  } catch (err) {
    logger?.warn?.({ err: err?.message || err }, 'Rehydrate group failed');
  }
  return record.group;
}

async function waitForInboxId({ identifier, xmtp, allowDeterministic }) {
  const envOpt = resolveXmtpEnv();
  /** @type {'production' | 'dev' | 'local'} */
  const typedEnv = envOpt === 'production' ? 'production'
    : envOpt === 'dev' ? 'dev'
    : 'local';
  const fast = isFastEnv();
  let tries = fast ? 8 : 180;
  const delayMs = envOpt === 'local' ? 200 : fast ? 150 : 1000;

  logger.info({
    identifier: identifier.identifier,
    identifierKind: identifier.identifierKind,
    envOpt: typedEnv,
    fast,
    tries,
    delayMs,
    allowDeterministic
  }, 'Starting inbox ID resolution');

  for (let i = 0; i < tries; i++) {
    let found = null;

    // Try local method first
    try {
      if (typeof xmtp?.findInboxIdByIdentifier === 'function') {
        found = await xmtp.findInboxIdByIdentifier(identifier);
        if (found) {
          logger.info({
            identifier: identifier.identifier,
            method: 'local',
            attempt: i + 1,
            inboxId: found
          }, 'Inbox ID found via local method');
          return found;
        }
      }
    } catch (err) {
      logger.debug({
        identifier: identifier.identifier,
        method: 'local',
        attempt: i + 1,
        error: err?.message || err
      }, 'Local inbox ID lookup failed');
    }

    // Try remote method
    try {
      found = await getInboxIdForIdentifier(identifier, typedEnv);
      if (found) {
        logger.info({
          identifier: identifier.identifier,
          method: 'remote',
          attempt: i + 1,
          inboxId: found
        }, 'Inbox ID found via remote method');
        return found;
      }
    } catch (err) {
      logger.debug({
        identifier: identifier.identifier,
        method: 'remote',
        attempt: i + 1,
        error: err?.message || err
      }, 'Remote inbox ID lookup failed');
    }

    logger.debug({
      identifier: identifier.identifier,
      attempt: i + 1,
      totalTries: tries,
      nextDelayMs: delayMs
    }, 'Inbox ID not found, retrying');

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Fallback to deterministic if allowed
  if (allowDeterministic) {
    try {
      const deterministicId = generateInboxId(identifier);
      logger.info({
        identifier: identifier.identifier,
        method: 'deterministic',
        inboxId: deterministicId
      }, 'Using deterministic inbox ID');
      return deterministicId;
    } catch (err) {
      logger.warn({
        identifier: identifier.identifier,
        error: err?.message || err
      }, 'Failed to generate deterministic inbox ID');
    }
  }

  logger.warn({
    identifier: identifier.identifier,
    totalAttempts: tries,
    allowDeterministic
  }, 'Failed to resolve inbox ID after all attempts');
  return null;
}

async function ensureInstallationsReady({ inboxId, xmtp, lastJoin, logger }) {
  const envOpt = resolveXmtpEnv();
  /** @type {'production' | 'dev' | 'local'} */
  const typedEnv = envOpt === 'production' ? 'production'
    : envOpt === 'dev' ? 'dev'
    : 'local';
  const isLocal = envOpt === 'local';
  const max = isLocal ? 40 : 60;
  const delay = isLocal ? 150 : 500;

  logger.info({
    inboxId,
    envOpt: typedEnv,
    isLocal,
    maxAttempts: max,
    delayMs: delay
  }, 'Starting installations readiness check');

  let candidateInstallationIds = [];
  let lastInboxState = null;

  for (let i = 0; i < max; i++) {
    try {
      if (typeof NodeXmtpClient.inboxStateFromInboxIds === 'function') {
        const states = await NodeXmtpClient.inboxStateFromInboxIds([inboxId], typedEnv);
        const state = Array.isArray(states) && states[0] ? states[0] : null;
        lastInboxState = state;
        candidateInstallationIds = Array.isArray(state?.installations)
          ? state.installations.map((inst) => String(inst?.id || '')).filter(Boolean)
          : [];

        logger.debug({
          inboxId,
          attempt: i + 1,
          hasState: !!state,
          installationCount: candidateInstallationIds.length,
          installationIds: candidateInstallationIds
        }, 'Inbox state check completed');

        if (candidateInstallationIds.length) break;
      } else {
        logger.warn({ inboxId, typedEnv }, 'NodeXmtpClient.inboxStateFromInboxIds not available');
        break;
      }
    } catch (err) {
      logger.debug({
        inboxId,
        attempt: i + 1,
        error: err?.message || err
      }, 'Inbox state check failed');
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (!candidateInstallationIds.length || typeof xmtp?.getKeyPackageStatusesForInstallationIds !== 'function') {
    return;
  }

  let lastStatuses = {};
  for (let i = 0; i < Math.min(max, 60); i++) {
    try {
      const statusMap = await xmtp.getKeyPackageStatusesForInstallationIds(candidateInstallationIds);
      lastStatuses = statusMap || {};
      const ids = Object.keys(statusMap || {});
      const ready = ids.some((id) => {
        const status = statusMap[id];
        if (!status) return false;
        const notAfter = /** @type {any} */ (status).lifetime?.notAfter;
        const notBefore = /** @type {any} */ (status).lifetime?.notBefore;
        if (typeof notAfter === 'bigint' || typeof notAfter === 'number') {
          const now = BigInt(Math.floor(Date.now() / 1000));
          const na = BigInt(notAfter);
          const nb = notBefore != null ? BigInt(notBefore) : now - 1n;
          return nb <= now && now < na;
        }
        return true;
      });
      if (ready) break;
    } catch {/* ignore */}
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  try {
    lastJoin.at = Date.now();
    lastJoin.payload = lastJoin.payload || {};
    lastJoin.payload.keyPackageProbe = {
      installationIds: candidateInstallationIds,
      statuses: Object.keys(lastStatuses || {})
    };
    lastJoin.payload.inboxStateProbe = {
      installationCount: Array.isArray(lastInboxState?.installations) ? lastInboxState.installations.length : null,
      identifierCount: Array.isArray(lastInboxState?.identifiers) ? lastInboxState.identifiers.length : null
    };
  } catch (err) {
    logger?.warn?.({ err: err?.message || err }, 'Failed to record join probes');
  }
}

async function ensureMemberInGroup({ group, inboxId, logger }) {
  const envOpt = resolveXmtpEnv();
  const fast = isFastEnv();
  const max = fast ? 3 : envOpt === 'local' ? 30 : 60;
  const delay = fast ? 100 : envOpt === 'local' ? 150 : 500;
  const target = normaliseHex(inboxId);
  for (let i = 0; i < max; i++) {
    const members = await getGroupMemberIds(group, logger);
    if (members.some((memberId) => memberId === target)) return;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

function trackMember(record, inboxId) {
  try {
    if (!record.memberSet) record.memberSet = new Set();
    record.memberSet.add(normaliseHex(inboxId));
  } catch {/* ignore */}
}

async function syncAndWarm({ group, xmtp, contractAddress, memberAddress }) {
  try {
    await syncXMTP(xmtp);
    try {
      if (group?.sync) await group.sync();
    } catch {/* ignore */}
  } catch {/* ignore */}
  try {
    if (typeof group?.send === 'function') {
      await group.send(JSON.stringify({ type: 'member-joined', address: memberAddress }));
    }
  } catch {/* ignore */}
  if (process.env.XMTP_METADATA_UPDATES === '0') return;
  try {
    if (typeof group?.updateDescription === 'function') {
      await group.updateDescription('Member joined');
    }
  } catch (err) {
    if (!String(err?.message || '').includes('succeeded')) {/* ignore metadata update errors unless success string is missing */}
  }
  try {
    if (typeof group?.updateName === 'function') {
      await group.updateName(`Templ ${contractAddress}`);
    }
  } catch (err) {
    if (!String(err?.message || '').includes('succeeded')) {/* ignore metadata update errors unless success string is missing */}
  }
}

async function addMemberToGroup({ group, inboxId, memberIdentifier, logger }) {
  logger.info({
    groupId: group?.id,
    inboxId,
    memberIdentifier,
    availableMethods: {
      addMembers: typeof group.addMembers === 'function',
      addMembersByInboxId: typeof group.addMembersByInboxId === 'function',
      addMembersByIdentifiers: typeof group.addMembersByIdentifiers === 'function'
    }
  }, 'Starting member addition to group');

  const normalizedInboxId = String(inboxId || '').replace(/^0x/i, '');

  try {
    if (typeof group.addMembers === 'function') {
      logger.info({ method: 'addMembers', inboxId: normalizedInboxId }, 'Attempting to add member using addMembers');
      await group.addMembers([normalizedInboxId]);
      logger?.info?.({ inboxId: normalizedInboxId, method: 'addMembers' }, 'addMembers([inboxId]) succeeded');
      return;
    }
    // Prefer explicit inboxId API if available
    if (typeof group.addMembersByInboxId === 'function') {
      logger.info({ method: 'addMembersByInboxId', inboxId: normalizedInboxId }, 'Attempting to add member using addMembersByInboxId');
      await group.addMembersByInboxId([normalizedInboxId]);
      logger?.info?.({ inboxId: normalizedInboxId, method: 'addMembersByInboxId' }, 'addMembersByInboxId([inboxId]) succeeded');
      return;
    }
    // Fall back to identifier-based API
    if (typeof group.addMembersByIdentifiers === 'function') {
      logger.info({ method: 'addMembersByIdentifiers', member: memberIdentifier.identifier }, 'Attempting to add member using addMembersByIdentifiers');
      await group.addMembersByIdentifiers([memberIdentifier]);
      logger?.info?.({ member: memberIdentifier.identifier, method: 'addMembersByIdentifiers' }, 'addMembersByIdentifiers succeeded');
      return;
    }
    // Legacy API: some SDKs expose addMembers(identifiers)
    if (typeof group.addMembers === 'function') {
      logger.info({ method: 'addMembers', member: memberIdentifier.identifier }, 'Attempting to add member using addMembers');
      await group.addMembers([memberIdentifier]);
      logger?.info?.({ member: memberIdentifier.identifier, method: 'addMembers' }, 'addMembers([identifier]) succeeded');
      return;
    }

    logger.error({
      groupId: group?.id,
      availableMethods: {
        addMembers: typeof group.addMembers === 'function',
        addMembersByInboxId: typeof group.addMembersByInboxId === 'function',
        addMembersByIdentifiers: typeof group.addMembersByIdentifiers === 'function'
      }
    }, 'No supported member addition method found');
    throw new Error('XMTP group does not support adding members');
  } catch (err) {
    const errMsg = String(err?.message || '');
    if (errMsg.includes('succeeded')) {
      logger.info({
        inboxId,
        method: 'unknown',
        rawMessage: errMsg
      }, 'Member addition succeeded despite error message');
    } else {
      logger.error({
        inboxId,
        error: errMsg,
        stack: err?.stack,
        errorType: err?.constructor?.name
      }, 'Failed to add member to group');
      throw err;
    }
  }
}

async function verifyPurchase({ hasJoined, contractAddress, memberAddress }) {
  let purchased;
  try {
    purchased = await hasJoined(contractAddress, memberAddress);
  } catch {
    throw templError('Purchase check failed', 500);
  }
  if (!purchased) {
    throw templError('Access not purchased', 403);
  }
}

export async function joinTemplWithXmtp(body, context) {
  const { contractAddress, memberAddress, chainId } = body;
  const {
    hasJoined,
    templs,
    logger,
    lastJoin,
    provider,
    xmtp,
    ensureGroup
  } = context;

  logger.info({
    contractAddress,
    memberAddress,
    chainId,
    serverInboxId: xmtp?.inboxId,
    body: {
      ...body,
      signature: '[REDACTED]'
    }
  }, 'Starting XMTP join request');

  const record = templs.get(contractAddress.toLowerCase());
  if (!record) {
    logger.warn({ contractAddress, availableTempls: Array.from(templs.keys()) }, 'Unknown Templ contract');
    throw templError('Unknown Templ', 404);
  }

  logger.info({
    contractAddress,
    templExists: !!record,
    hasGroupId: !!record.groupId
  }, 'Templ record found');

  await verifyPurchase({ hasJoined, contractAddress, memberAddress });

  logger.info({
    contractAddress,
    memberAddress
  }, 'Purchase verification successful');

  if (shouldVerifyContracts()) {
    logger.info({ contractAddress, chainId }, 'Verifying contract deployment');
    await ensureContractDeployed({ provider, contractAddress, chainId: Number(chainId) });
    logger.info({ contractAddress }, 'Contract deployment verification successful');
  }

  logger.info({
    contractAddress,
    recordHasGroup: !!record.group,
    usingEnsureGroup: typeof ensureGroup === 'function'
  }, 'Attempting to hydrate group');

  const group = await hydrateGroup(record, { ensureGroup, xmtp, logger });
  if (!group) {
    logger.warn({
      contractAddress,
      recordGroupId: record.groupId,
      ensureGroupAvailable: typeof ensureGroup === 'function'
    }, 'Group hydration failed');
    throw templError('Group not ready yet; retry shortly', 503);
  }

  const membersBefore = await getGroupMemberIds(group, logger);

  logger.info({
    contractAddress,
    groupId: group.id,
    groupName: group.name,
    groupMembersCount: membersBefore.length
  }, 'Group hydration successful');

  const memberIdentifier = { identifier: memberAddress.toLowerCase(), identifierKind: 0 };
  const providedInboxId = parseProvidedInboxId(body?.inboxId || body?.memberInboxId);
  const allowDeterministic = allowDeterministicInbox();

  logger.info({
    memberAddress,
    providedInboxId,
    allowDeterministic,
    memberIdentifier
  }, 'Starting inbox ID resolution');

  const resolvedInboxId = await waitForInboxId({ identifier: memberIdentifier, xmtp, allowDeterministic });
  let inboxId = resolvedInboxId;
  if (!inboxId && allowDeterministic) {
    logger.info({ providedInboxId, resolvedInboxId }, 'Using deterministic inbox ID');
    inboxId = providedInboxId || null;
  }
  if (!inboxId) {
    logger.warn({
      memberAddress,
      providedInboxId,
      resolvedInboxId,
      allowDeterministic
    }, 'Failed to resolve member inbox ID');
    throw templError('Member identity not registered yet; retry shortly', 503);
  }

  if (resolvedInboxId && providedInboxId && normaliseHex(resolvedInboxId) !== normaliseHex(providedInboxId)) {
    logger?.info?.({ resolvedInboxId, providedInboxId }, 'Resolved inbox overrides provided value');
  }

  logger.info({
    inboxId,
    fastEnv: isFastEnv()
  }, 'Ensuring installations are ready');

  await ensureInstallationsReady({ inboxId, xmtp, lastJoin, logger });

  const readyTries = isFastEnv() ? 2 : 60;
  logger.info({
    inboxId,
    readyTries,
    fastEnv: isFastEnv()
  }, 'Waiting for inbox readiness');

  const ready = await waitForInboxReady(inboxId, readyTries);
  logger?.info?.({ inboxId, ready, readyTries }, 'Member inbox readiness before add');

  const joinMeta = {
    contract: contractAddress.toLowerCase(),
    member: memberAddress.toLowerCase(),
    inboxId,
    serverInboxId: xmtp?.inboxId || null,
    groupId: group?.id || record.groupId || null
  };

  let beforeAgg = null;
  try {
    beforeAgg = xmtp?.debugInformation?.apiAggregateStatistics?.();
    joinMeta.beforeAgg = beforeAgg;
  } catch (err) {
    logger.debug({ err: err?.message || err }, 'Failed to get before API statistics');
  }

  logger?.info?.(joinMeta, 'Inviting member by inboxId');

  const beforeAddMembers = await getGroupMemberIds(group, logger);
  logger.info({
    inboxId,
    groupId: group.id,
    groupMembersBefore: beforeAddMembers.length
  }, 'Adding member to XMTP group');
  try { if (typeof group?.sync === 'function') { await group.sync(); } } catch {/* ignore */}
  await addMemberToGroup({ group, inboxId, memberIdentifier, logger });

  const afterAddMembers = await getGroupMemberIds(group, logger);
  logger.info({
    inboxId,
    groupId: group.id,
    groupMembersAfter: afterAddMembers.length
  }, 'Member addition completed');

  try {
    await syncXMTP(xmtp);
    try {
      if (group?.sync) await group.sync();
    } catch {/* ignore */}
  } catch (err) {
    logger?.warn?.({ err }, 'Server sync after join failed');
  }

  await ensureMemberInGroup({ group, inboxId, logger });

  try {
    lastJoin.at = Date.now();
    lastJoin.payload = { joinMeta };
    try {
      const afterAgg = xmtp?.debugInformation?.apiAggregateStatistics?.();
      logger?.info?.({ beforeAgg, afterAgg }, 'XMTP API stats around member add');
      lastJoin.payload.afterAgg = afterAgg;
      lastJoin.payload.beforeAgg = beforeAgg;
    } catch {/* ignore */}
  } catch {/* ignore */}

  trackMember(record, inboxId);
  await syncAndWarm({ group, xmtp, contractAddress, memberAddress });
  try {
    await syncXMTP(xmtp);
    if (typeof group?.sync === 'function') {
      await group.sync();
    }
  } catch {/* ignore */}

  logger?.info?.({ contract: contractAddress, inboxId }, 'Member joined successfully');
  return { groupId: group.id };
}
