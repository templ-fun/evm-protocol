import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { Client } from '@xmtp/node-sdk';
import { createXmtpWithRotation } from '../src/server.js';

test('createXmtpWithRotation respects maxAttempts', async () => {
  const wallet = new Wallet('0x' + '1'.repeat(64));
  let calls = 0;
  const origCreate = Client.create;
  Client.create = async () => {
    calls++;
    throw new Error('already registered 10/10 installations');
  };
  await assert.rejects(
    () => createXmtpWithRotation(wallet, 3),
    /Unable to register XMTP client after nonce rotation/
  );
  assert.equal(calls, 3);
  Client.create = origCreate;
});
