import assert from 'node:assert/strict';
import { buildDelegateMessage, buildMuteMessage } from './signing.js';

let testFn;
try {
  ({ test: testFn } = await import('vitest'));
} catch {
  ({ test: testFn } = await import('node:test'));
}

testFn('buildDelegateMessage formats delegate message', () => {
  assert.equal(
    buildDelegateMessage('0xAbC', '0xDeF'),
    'delegate:0xabc:0xdef'
  );
});

testFn('buildMuteMessage formats mute message', () => {
  assert.equal(
    buildMuteMessage('0xAbC', '0xDeF'),
    'mute:0xabc:0xdef'
  );
});
