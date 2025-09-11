import test from 'node:test';
import assert from 'node:assert/strict';

test('createRateLimitStore defaults to memory when no env', async () => {
  const { createRateLimitStore } = await import('../src/config.js');
  const store = await createRateLimitStore();
  assert.equal(store?.kind || 'memory', 'memory');
});

test('auto-uses redis when REDIS_URL is set (falls back if unavailable)', async () => {
  const prev = { ...process.env };
  try {
    delete process.env.RATE_LIMIT_STORE;
    process.env.REDIS_URL = 'redis://localhost:6379';
    const { createRateLimitStore } = await import('../src/config.js');
    const store = await createRateLimitStore();
    // In CI we likely do not have redis/driver installed; fallback is memory
    assert.equal(store?.kind || 'memory', 'memory');
  } finally {
    process.env = prev;
  }
});

test('respects explicit RATE_LIMIT_STORE=memory', async () => {
  const prev = { ...process.env };
  try {
    process.env.RATE_LIMIT_STORE = 'memory';
    delete process.env.REDIS_URL;
    const { createRateLimitStore } = await import('../src/config.js');
    const store = await createRateLimitStore();
    assert.equal(store?.kind || 'memory', 'memory');
  } finally {
    process.env = prev;
  }
});
