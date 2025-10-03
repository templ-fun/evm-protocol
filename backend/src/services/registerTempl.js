import { randomBytes } from 'crypto';
import { ethers, getAddress } from 'ethers';
import { generateInboxId, getInboxIdForIdentifier } from '@xmtp/node-sdk';
import { syncXMTP } from '../../../shared/xmtp.js';
import {
  resolveXmtpEnv,
  shouldSkipNetworkResolution,
  shouldUseEphemeralCreator,
  shouldUpdateMetadata,
  shouldVerifyContracts,
  allowDeterministicInbox
} from '../xmtp/options.js';
import {
  ensureContractDeployed,
  ensurePriestMatchesOnChain,
  ensureTemplFromFactory
} from './contractValidation.js';

function templError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function normaliseAddress(value, field) {
  if (!value || typeof value !== 'string') {
    throw templError(`Missing ${field}`, 400);
  }
  try {
    return getAddress(value).toLowerCase();
  } catch {
    throw templError(`Invalid ${field}`, 400);
  }
}

function normaliseChatId(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed.length) return null;
  if (!/^(-?[1-9]\d*)$/.test(trimmed)) {
    throw templError('Invalid telegramChatId', 400);
  }
  return trimmed;
}

function normaliseGroupId(value) {
  if (!value) return null;
  return String(value).replace(/^0x/i, '');
}

async function resolvePriestInboxIds({ priestAddress, xmtp, logger }) {
  const identifiers = [];
  if (!priestAddress) return identifiers;
  const identifier = { identifier: priestAddress.toLowerCase(), identifierKind: 0 };
  const envOpt = resolveXmtpEnv();
  const skipNetwork = shouldSkipNetworkResolution();
  if (!skipNetwork) {
    try {
      const resolved = await getInboxIdForIdentifier(identifier, envOpt);
      if (resolved) {
        identifiers.push(resolved);
      }
    } catch (err) {
      logger?.warn?.({ err: String(err?.message || err) }, 'Priest inbox resolution failed');
    }
  }
  if (allowDeterministicInbox()) {
    try {
      const deterministic = generateInboxId(identifier);
      if (!identifiers.some((id) => normaliseGroupId(id) === normaliseGroupId(deterministic))) {
        identifiers.push(deterministic);
      }
    } catch (err) {
      logger?.warn?.({ err: String(err?.message || err) }, 'Deterministic inbox generation failed');
    }
  }
  if (xmtp?.inboxId) {
    const serverInbox = normaliseGroupId(xmtp.inboxId);
    if (serverInbox && !identifiers.some((id) => normaliseGroupId(id) === serverInbox)) {
      identifiers.push(xmtp.inboxId);
    }
  }
  return identifiers;
}

async function createGroup({
  contractAddress,
  inboxIds,
  xmtp,
  logger,
  disableWait,
  useEphemeral,
  createXmtpWithRotation
}) {
  if (!Array.isArray(inboxIds) || inboxIds.length === 0) {
    throw new Error('No inbox ids resolved for templ priest');
  }
  if (!useEphemeral) {
    if (typeof xmtp?.conversations?.newGroup !== 'function') {
      throw new Error('XMTP client missing newGroup capability');
    }
    if (disableWait) {
      const timeoutMs = 3000;
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('newGroup timed out')), timeoutMs));
      return Promise.race([xmtp.conversations.newGroup(inboxIds), timeout]);
    }
    return xmtp.conversations.newGroup(inboxIds);
  }
  const wallet = ethers.Wallet.createRandom();
  const ephemeralClient = await createXmtpWithRotation(wallet);
  try {
    if (typeof ephemeralClient?.conversations?.newGroup !== 'function') {
      throw new Error('Ephemeral XMTP client missing newGroup capability');
    }
    const group = await ephemeralClient.conversations.newGroup(inboxIds);
    if (shouldUpdateMetadata()) {
      try { await group.updateName?.(`Templ ${contractAddress}`); } catch {/* ignore */}
      try { await group.updateDescription?.('Private templ governance chat'); } catch {/* ignore */}
    }
    try {
      await syncXMTP(xmtp);
      const hydrated = await xmtp.conversations?.getConversationById?.(group.id);
      if (hydrated) {
        return hydrated;
      }
    } catch {/* ignore */}
    return group;
  } finally {
    try {
      const maybeClose = /** @type {any} */ (ephemeralClient)?.close;
      if (typeof maybeClose === 'function') {
        await maybeClose.call(ephemeralClient);
      }
    } catch (err) {
      logger?.warn?.({ err: String(err?.message || err) }, 'Failed closing ephemeral XMTP client');
    }
  }
}

async function findGroupByDiff({ xmtp, beforeIds, contractAddress, logger }) {
  try {
    const all = (await xmtp?.conversations?.list?.()) ?? [];
    const normalizedBefore = new Set(beforeIds.map((id) => normaliseGroupId(id)));
    const diff = all.find((conversation) => !normalizedBefore.has(normaliseGroupId(conversation.id)));
    if (diff) return diff;
    const expectedName = `Templ ${contractAddress}`;
    return all.find((conversation) => conversation.name === expectedName) ?? null;
  } catch (err) {
    logger?.warn?.({ err: String(err?.message || err) }, 'XMTP diff scan failed');
    return null;
  }
}

async function warmGroup(group, contractAddress, logger) {
  if (!group || typeof group.send !== 'function') return;
  try {
    await group.send(JSON.stringify({ type: 'templ-created', contract: contractAddress }));
  } catch (err) {
    logger?.warn?.({ err: String(err?.message || err) }, 'Failed to publish templ-created system message');
  }
}

export async function registerTempl(body, context) {
  const { contractAddress, priestAddress } = body;
  const {
    provider,
    logger,
    templs,
    persist,
    watchContract,
    findBinding,
    skipFactoryValidation,
    xmtp,
    createXmtpWithRotation: rotateXmtp
  } = context;

  const contract = normaliseAddress(contractAddress, 'contractAddress');
  const priest = normaliseAddress(priestAddress, 'priestAddress');
  const telegramChatId = normaliseChatId(body.telegramChatId ?? body.groupId ?? body.chatId);
  logger?.info?.({ contract, priest, telegramChatId }, 'Register templ request received');

  if (shouldVerifyContracts()) {
    await ensureContractDeployed({ provider, contractAddress: contract, chainId: Number(body?.chainId) });
    await ensurePriestMatchesOnChain({ provider, contractAddress: contract, priestAddress: priest });
  }

  const trustedFactory = process.env.TRUSTED_FACTORY_ADDRESS?.trim();
  if (trustedFactory && !skipFactoryValidation) {
    await ensureTemplFromFactory({ provider, contractAddress: contract, factoryAddress: trustedFactory });
  }

  let existing = templs.get(contract);
  if (!existing) {
    const persisted = typeof findBinding === 'function' ? await findBinding(contract) : null;
    existing = {
      telegramChatId: persisted?.telegramChatId ?? null,
      xmtpGroupId: persisted?.xmtpGroupId ?? null,
      priest: priest,
      proposalsMeta: new Map(),
      lastDigestAt: 0,
      templHomeLink: '',
      bindingCode: persisted?.bindingCode ?? null,
      contractAddress: contract,
      memberSet: new Set()
    };
    if (persisted?.priest) {
      existing.priest = String(persisted.priest).toLowerCase();
    }
  }
  if (!(existing.proposalsMeta instanceof Map)) {
    existing.proposalsMeta = new Map();
  }
  if (!(existing.memberSet instanceof Set)) {
    try {
      const restored = Array.isArray(existing.memberSet) ? existing.memberSet : [];
      existing.memberSet = new Set(restored.map((value) => String(value || '').toLowerCase()));
    } catch {
      existing.memberSet = new Set();
    }
  }
  existing.priest = priest;
  existing.contractAddress = contract;
  existing.telegramChatId = telegramChatId ?? existing.telegramChatId ?? null;

  let resolvedHomeLink = existing.templHomeLink || '';
  if (provider) {
    try {
      const reader = new ethers.Contract(contract, ['function templHomeLink() view returns (string)'], provider);
      const onchainLink = await reader.templHomeLink();
      if (typeof onchainLink === 'string') {
        resolvedHomeLink = onchainLink;
      }
    } catch (err) {
      logger?.warn?.({ err, contract }, 'templHomeLink() unavailable during registration');
    }
  }
  existing.templHomeLink = resolvedHomeLink;

  let bindingCode = existing.bindingCode || null;
  if (!existing.telegramChatId) {
    if (!bindingCode) {
      bindingCode = randomBytes(16).toString('hex');
    }
    existing.bindingCode = bindingCode;
  } else {
    existing.bindingCode = null;
  }

  if (xmtp) {
    let group = existing.group;
    if (!group && existing.xmtpGroupId) {
      try {
        await syncXMTP(xmtp);
        group = await xmtp.conversations?.getConversationById?.(existing.xmtpGroupId);
      } catch (err) {
        logger?.warn?.({ err: String(err?.message || err), contract }, 'Failed to hydrate existing XMTP group during register');
      }
    }

    if (!group) {
      let beforeIds = [];
      try {
        await syncXMTP(xmtp);
        const beforeList = (await xmtp.conversations?.list?.()) ?? [];
        beforeIds = beforeList.map((c) => c.id);
      } catch (err) {
        logger?.warn?.({ err: String(err?.message || err), contract }, 'XMTP sync prior to group creation failed');
      }

      const inboxIds = await resolvePriestInboxIds({ priestAddress: priest, xmtp, logger });
      const disableWait = shouldSkipNetworkResolution();
      const useEphemeral = !disableWait && shouldUseEphemeralCreator();
      const createXmtp = rotateXmtp ?? context.createXmtpWithRotation;

      try {
        group = await createGroup({
          contractAddress: contract,
          inboxIds,
          xmtp,
          logger,
          disableWait,
          useEphemeral,
          createXmtpWithRotation: createXmtp
        });
      } catch (err) {
        logger?.warn?.({ err: String(err?.message || err), contract }, 'XMTP newGroup failed; attempting diff recovery');
        try { await syncXMTP(xmtp); } catch {/* ignore */}
        group = await findGroupByDiff({ xmtp, beforeIds, contractAddress: contract, logger });
        if (!group) {
          throw err;
        }
      }

      await warmGroup(group, contract);
    }

    if (group) {
      existing.group = group;
      existing.groupId = group.id;
      existing.xmtpGroupId = group.id;
      try {
        await syncXMTP(xmtp);
      } catch (err) {
        logger?.warn?.({ err: String(err?.message || err), contract }, 'XMTP sync after group init failed');
      }
    }
  }

  templs.set(contract, existing);
  await persist(contract, existing);
  if (typeof watchContract === 'function') {
    await watchContract(contract, existing);
  }

  return {
    templ: {
      contract,
      priest,
      telegramChatId: existing.telegramChatId,
      templHomeLink: resolvedHomeLink,
      groupId: existing.xmtpGroupId ?? null
    },
    bindingCode,
    groupId: existing.xmtpGroupId ?? null
  };
}
