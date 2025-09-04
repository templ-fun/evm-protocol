import { ethers } from 'ethers';
import { Client } from '@xmtp/node-sdk';
import { logger } from '../logger.js';

export async function createXmtpWithRotation(wallet, maxAttempts = 100000000) {
  const dbEncryptionKey = new Uint8Array(32);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const xmtpSigner = {
      type: 'EOA',
      getAddress: () => wallet.address,
      getIdentifier: () => ({
        identifier: wallet.address.toLowerCase(),
        identifierKind: 0, // Ethereum enum
        nonce: attempt
      }),
      signMessage: async (message) => {
        let messageToSign;
        if (message instanceof Uint8Array) {
          try {
            messageToSign = ethers.toUtf8String(message);
          } catch {
            messageToSign = ethers.hexlify(message);
          }
        } else if (typeof message === 'string') {
          messageToSign = message;
        } else {
          messageToSign = String(message);
        }
        const signature = await wallet.signMessage(messageToSign);
        return ethers.getBytes(signature);
      }
    };
    try {
      // @ts-ignore - Node SDK accepts EOA-like signers; our JS object matches at runtime
      const env = process.env.XMTP_ENV || 'dev';
      // @ts-ignore - TS cannot discriminate the 'EOA' literal on JS object; safe at runtime
      return await Client.create(xmtpSigner, {
        dbEncryptionKey,
        env,
        loggingLevel: 'off',
        appVersion: 'templ/0.1.0'
      });
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes('already registered 10/10 installations')) {
        logger.warn({ attempt }, 'XMTP installation limit reached, rotating inbox');
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unable to register XMTP client after nonce rotation');
}
