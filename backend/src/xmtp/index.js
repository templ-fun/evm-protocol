// XMTP helper functions
import { ethers } from 'ethers';
import { Client, getInboxIdForIdentifier } from '@xmtp/node-sdk';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { waitFor } from '../../../shared/xmtp-wait.js';
import { XMTP_CONSENT_STATES } from '../../../shared/xmtp.js';
import { logger } from '../logger.js';
import { resolveXmtpEnv } from './options.js';

const resolvedEnv = resolveXmtpEnv();
export const XMTP_ENV = /** @type {'local' | 'dev' | 'production'} */ (
  ['local', 'dev', 'production'].includes(resolvedEnv) ? resolvedEnv : 'dev'
);

// Linearize: wait until the target inbox is visible on the XMTP network
export async function waitForInboxReady(inboxId, tries = 60) {
  const id = String(inboxId || '').replace(/^0x/i, '');
  if (!id) return false;
  if (!['local', 'dev', 'production'].includes(XMTP_ENV)) return true;
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_XMTP_WAIT === '1') return true;
  if (typeof Client.inboxStateFromInboxIds !== 'function') return true;
  const envOpt = /** @type {any} */ (
    ['local', 'dev', 'production'].includes(XMTP_ENV) ? XMTP_ENV : 'dev'
  );
  const result = await waitFor({
    tries,
    delayMs: 1000,
    check: async () => {
      const states = await Client.inboxStateFromInboxIds([id], envOpt);
      logger.info({ inboxId: id, states }, 'Inbox states (inboxStateFromInboxIds)');
      return Array.isArray(states) && states.length > 0;
    },
    onError: (e) => {
      logger.debug(
        { err: String(e?.message || e), inboxId: id },
        'Inbox state check failed'
      );
    }
  });
  return Boolean(result);
}

async function ensureDirectoryExists(pathname) {
  try {
    await fs.mkdir(pathname, { recursive: true });
  } catch (err) {
    if (err && err.code !== 'EEXIST') {
      throw err;
    }
  }
}

async function revokeStaleInstallations({ wallet, env }) {
  logger.info({
    walletAddress: wallet.address.toLowerCase(),
    environment: env
  }, 'Starting stale installations revocation');

  try {
    const identifier = {
      identifier: wallet.address.toLowerCase(),
      identifierKind: 0
    };

    logger.debug({
      walletAddress: wallet.address.toLowerCase(),
      identifier
    }, 'Getting inbox ID for revocation');

    const inboxId = await getInboxIdForIdentifier(identifier, env);
    if (!inboxId) {
      logger.warn({
        walletAddress: wallet.address.toLowerCase(),
        env
      }, 'No XMTP inbox found while attempting revocation');
      return false;
    }

    logger.info({
      inboxId,
      walletAddress: wallet.address.toLowerCase()
    }, 'Inbox ID found, fetching installation states');

    const states = await Client.inboxStateFromInboxIds([inboxId], env);
    const state = Array.isArray(states) && states[0] ? states[0] : null;

    if (!state) {
      logger.warn({
        inboxId,
        walletAddress: wallet.address.toLowerCase()
      }, 'No inbox state found for revocation');
      return false;
    }

    const installations = Array.isArray(state?.installations) ? state.installations : [];

    logger.info({
      inboxId,
      installationCount: installations.length,
      installationIds: installations.map(inst => inst?.id)
    }, 'Found installations for potential revocation');

    if (!installations.length) {
      logger.warn({ inboxId }, 'XMTP inbox has no installations to revoke');
      return false;
    }

    const payload = installations
      .map((inst) => {
        if (inst?.bytes instanceof Uint8Array) return inst.bytes;
        if (typeof inst?.bytes === 'string') {
          try { return ethers.getBytes(inst.bytes); }
          catch {
            logger.debug({ installationId: inst?.id, reason: 'bytes parse error' }, 'Failed to parse installation bytes');
            return null;
          }
        }
        if (inst?.id) {
          try { return ethers.getBytes(inst.id); }
          catch {
            logger.debug({ installationId: inst?.id, reason: 'id parse error' }, 'Failed to parse installation ID');
            return null;
          }
        }
        logger.debug({ installation: inst }, 'Installation missing both bytes and ID');
        return null;
      })
      .filter((value) => value instanceof Uint8Array);

    if (!payload.length) {
      logger.warn({
        inboxId,
        totalInstallations: installations.length,
        validInstallations: payload.length
      }, 'Unable to derive installation bytes for revocation');
      return false;
    }

    logger.info({
      inboxId,
      installationsToRevoke: payload.length,
      totalInstallations: installations.length
    }, 'Proceeding with installation revocation');

    const revoker = {
      type: 'EOA',
      getIdentifier: () => ({
        identifier: wallet.address.toLowerCase(),
        identifierKind: 0,
        nonce: Date.now()
      }),
      signMessage: async (message) => {
        logger.debug({ messageType: typeof message }, 'Revoker signing message');
        let toSign;
        if (message instanceof Uint8Array) {
          try { toSign = ethers.toUtf8String(message); } catch { toSign = ethers.hexlify(message); }
        } else if (typeof message === 'string') {
          toSign = message;
        } else {
          toSign = String(message);
        }
        const signature = await wallet.signMessage(toSign);
        return ethers.getBytes(signature);
      }
    };

    await Client.revokeInstallations(revoker, inboxId, payload, env);
    logger.warn({
      inboxId,
      revokedCount: payload.length,
      remainingInstallations: installations.length - payload.length
    }, 'Successfully revoked stale XMTP installations');
    return true;
  } catch (err) {
    logger.error({
      walletAddress: wallet.address.toLowerCase(),
      env,
      error: err?.message || err,
      stack: err?.stack,
      errorType: err?.constructor?.name
    }, 'Failed to revoke stale XMTP installations');
    return false;
  }
}

export async function createXmtpWithRotation(wallet, maxAttempts = 20) {
  logger.info({
    walletAddress: wallet.address,
    maxAttempts,
    environment: XMTP_ENV
  }, 'Starting XMTP client creation with rotation');

  // Derive a stable 32-byte SQLCipher key for the XMTP Node DB.
  // Priority: explicit BACKEND_DB_ENC_KEY (hex) -> keccak256(privateKey + env) -> zero key (last resort)
  let dbEncryptionKey;
  try {
    const explicit = process.env.BACKEND_DB_ENC_KEY;
    if (explicit && /^0x?[0-9a-fA-F]{64}$/.test(String(explicit))) {
      const hex = explicit.startsWith('0x') ? explicit : `0x${explicit}`;
      dbEncryptionKey = ethers.getBytes(hex);
    } else if (wallet?.privateKey) {
      const env = resolveXmtpEnv();
      const material = ethers.concat([ethers.getBytes(wallet.privateKey), ethers.toUtf8Bytes(`:${env}:templ-db-key`) ]);
      const keyHex = ethers.keccak256(material);
      dbEncryptionKey = ethers.getBytes(keyHex);
    } else {
      // In production, do not allow zero-key fallback
      if (process.env.NODE_ENV === 'production') {
        throw new Error('BACKEND_DB_ENC_KEY required in production');
      }
      // Fallback zeroed key in non-prod; logged for visibility only
      logger.warn('Using fallback zeroed dbEncryptionKey; set BACKEND_DB_ENC_KEY for security');
      dbEncryptionKey = new Uint8Array(32);
    }
  } catch (err) {
    logger.warn({ err: err?.message || err }, 'Failed to derive DB encryption key, using fallback');
    dbEncryptionKey = new Uint8Array(32);
  }

  const baseDir = process.env.XMTP_DB_DIR || '/var/lib/templ/xmtp';
  const dbPath = process.env.XMTP_DB_PATH || join(baseDir, `${XMTP_ENV}-${wallet.address.toLowerCase()}.db3`);

  logger.info({
    baseDir,
    dbPath,
    hasExplicitKey: !!process.env.BACKEND_DB_ENC_KEY,
    dbKeySource: process.env.BACKEND_DB_ENC_KEY ? 'explicit' : wallet.privateKey ? 'derived' : 'fallback'
  }, 'XMTP database configuration');

  try {
    await ensureDirectoryExists(dirname(dbPath));
  } catch (err) {
    logger.warn({ err: err?.message || err, dbPath }, 'Failed to prepare XMTP db directory');
  }

  let revocationAttempted = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info({
      attempt,
      totalAttempts: maxAttempts,
      walletAddress: wallet.address.toLowerCase()
    }, 'XMTP client creation attempt');

    /** @type {import('@xmtp/node-sdk').Signer} */
    const xmtpSigner = /** @type {import('@xmtp/node-sdk').Signer} */ ({
      type: 'EOA',
      getIdentifier: () => ({
        identifier: wallet.address.toLowerCase(),
        identifierKind: 0, // Ethereum enum
        nonce: attempt
      }),
      signMessage: async (message) => {
        let toSign;
        if (message instanceof Uint8Array) {
          try {
            toSign = ethers.toUtf8String(message);
          } catch {
            toSign = ethers.hexlify(message);
          }
        } else if (typeof message === 'string') {
          toSign = message;
        } else {
          toSign = String(message);
        }
        const signature = await wallet.signMessage(toSign);
        return ethers.getBytes(signature);
      }
    });
    try {
      // @ts-ignore - Node SDK accepts EOA-like signers; our JS object matches at runtime
      const env = XMTP_ENV;
      // @ts-ignore - TS cannot discriminate the 'EOA' literal on JS object; safe at runtime
      const loggingLevel = /** @type {any} */ (
        process.env.XMTP_LOG_LEVEL ||
        (process.env.NODE_ENV === 'production' ? 'warn' : 'debug')
      );
      const structuredLogging = process.env.XMTP_STRUCTURED_LOGGING === '1';
      const appVersion = process.env.XMTP_APP_VERSION || 'templ/1.0.1';
      const apiUrl = process.env.XMTP_API_URL;
      if (apiUrl) {
        logger.info({ apiUrl }, 'XMTP using custom API URL override');
      }

      const clientConfig = {
        dbEncryptionKey,
        dbPath,
        env,
        loggingLevel,
        structuredLogging,
        appVersion,
        ...(apiUrl ? { apiUrl } : {})
      };

      logger.debug({
        clientConfig: {
          ...clientConfig,
          dbEncryptionKey: '[REDACTED]'
        }
      }, 'XMTP client configuration');

      const client = await Client.create(xmtpSigner, clientConfig);

      logger.info({
        attempt,
        inboxId: client.inboxId,
        isRegistered: client.isRegistered,
        dbPath
      }, 'XMTP client created successfully');

      return client;
    } catch (err) {
      const msg = String(err?.message || err);
      logger.error({
        attempt,
        error: msg,
        stack: err?.stack,
        errorCode: err?.code,
        errorType: err?.constructor?.name
      }, 'XMTP client creation failed');

      if (msg.includes('already registered 10/10 installations')) {
        logger.warn({ attempt }, 'XMTP installation limit reached, rotating inbox');
        if (!revocationAttempted) {
          logger.info({ attempt }, 'Attempting to revoke stale XMTP installations');
          const revoked = await revokeStaleInstallations({ wallet, env: XMTP_ENV });
          revocationAttempted = true;
          logger.info({ attempt, revoked }, 'Stale installations revocation result');
          if (revoked) {
            await new Promise((resolve) => setTimeout(resolve, 750));
          }
        } else {
          logger.warn({ attempt }, 'Already attempted installation revocation, skipping');
        }
        continue;
      }
      throw err;
    }
  }

  logger.error({
    maxAttempts,
    walletAddress: wallet.address.toLowerCase(),
    environment: XMTP_ENV,
    revocationAttempted
  }, 'XMTP client creation failed after all attempts');
  throw new Error('Unable to register XMTP client after nonce rotation');
}

// Wait for the XMTP client to be able to talk to the network deterministically.
export async function waitForXmtpClientReady(xmtp, tries = 30, delayMs = 500) {
  const env = resolveXmtpEnv();
  const inboxId = xmtp?.inboxId;

  logger.info({
    inboxId,
    environment: env,
    tries,
    delayMs,
    hasClient: !!xmtp
  }, 'Starting XMTP client readiness check');

  return Boolean(await waitFor({
    tries,
    delayMs,
    check: async () => {
      let ready = false;
      let steps = [];

      // Step 1: Check preferences inbox state
      try {
        steps.push('preferences-inbox-state');
        await xmtp?.preferences?.inboxState?.(true);
        logger.debug({ inboxId, step: 'preferences-inbox-state' }, 'XMTP preferences inbox state check succeeded');
      } catch (err) {
        logger.debug({
          inboxId,
          step: 'preferences-inbox-state',
          error: err?.message || err
        }, 'XMTP preferences inbox state check failed');
      }

      // Step 2: Try conversations sync
      try {
        steps.push('conversations-sync');
        await xmtp?.conversations?.sync?.();
        logger.debug({ inboxId, step: 'conversations-sync' }, 'XMTP conversations sync succeeded');
      } catch (err) {
        logger.debug({
          inboxId,
          step: 'conversations-sync',
          error: err?.message || err
        }, 'XMTP conversations sync failed');
      }

      // Step 3: Try API aggregate statistics
      try {
        steps.push('api-aggregate-stats');
        const agg = await xmtp?.debugInformation?.apiAggregateStatistics?.();
        if (typeof agg === 'string' && agg.includes('Api Stats')) {
          logger.debug({ inboxId, step: 'api-aggregate-stats' }, 'XMTP API aggregate statistics check succeeded');
          ready = true;
        }
      } catch (err) {
        logger.debug({
          inboxId,
          step: 'api-aggregate-stats',
          error: err?.message || err
        }, 'XMTP API aggregate statistics check failed');
      }

      // Step 4: Try listing conversations
      if (!ready) {
        try {
          steps.push('conversations-list');
          const list = await xmtp?.conversations?.list?.({
            consentStates: [
              XMTP_CONSENT_STATES.ALLOWED,
              XMTP_CONSENT_STATES.UNKNOWN,
              XMTP_CONSENT_STATES.DENIED
            ]
          });
          if (Array.isArray(list)) {
            logger.debug({
              inboxId,
              step: 'conversations-list',
              conversationCount: list.length
            }, 'XMTP conversations list succeeded');
            ready = true;
          }
        } catch (err) {
          logger.debug({
            inboxId,
            step: 'conversations-list',
            error: err?.message || err
          }, 'XMTP conversations list failed');
        }
      }

      // Step 5: Last resort - try inbox state from ID
      if (!ready) {
        try {
          steps.push('inbox-state-from-id');
          const id = String(xmtp?.inboxId || '').replace(/^0x/i, '');
          if (id && typeof Client.inboxStateFromInboxIds === 'function') {
            const envOpt = /** @type {any} */ (['local','dev','production'].includes(env) ? env : 'dev');
            const states = await Client.inboxStateFromInboxIds([id], envOpt);
            if (Array.isArray(states)) {
              logger.debug({
                inboxId,
                step: 'inbox-state-from-id',
                statesCount: states.length
              }, 'XMTP inbox state from ID succeeded');
              ready = true;
            }
          }
        } catch (err) {
          logger.debug({
            inboxId,
            step: 'inbox-state-from-id',
            error: err?.message || err
          }, 'XMTP inbox state from ID failed');
        }
      }

      if (ready) {
        logger.info({
          inboxId,
          successfulSteps: steps
        }, 'XMTP client is ready');
      } else {
        logger.debug({
          inboxId,
          attemptedSteps: steps
        }, 'XMTP client not ready yet');
      }

      return ready;
    },
    onError: (err) => {
      logger.warn({
        inboxId,
        error: err?.message || err,
        stepsRemaining: tries
      }, 'XMTP readiness check failed');
    }
  }));
}
