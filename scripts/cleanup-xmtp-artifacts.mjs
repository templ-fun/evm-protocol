#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targets = [
  {
    dir: path.join(rootDir, 'frontend'),
    patterns: [
      /^xmtp-local-.*\.db3(?:\.sqlcipher_salt|-(?:shm|wal))?$/i,
      /^xmtp-local-.*\.db3-?(?:shm|wal)?$/i,
      /^pw-xmtp\.db(?:-(?:shm|wal))?$/i,
      /^pw-xmtp\.db(?:\.shm|\.wal)?$/i,
      /^xmtp-local-.*\.db3$/i
    ]
  },
  {
    dir: path.join(rootDir, 'backend'),
    patterns: [
      /^xmtp-.*\.db(?:\.sqlcipher_salt)?$/i,
      /^xmtp-.*\.db-(?:shm|wal)$/i,
      /^xmtp-.*\.db(?:\.shm|\.wal)?$/i
    ]
  }
];

async function removeMatches(dir, patterns) {
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  await Promise.all(entries.map(async (name) => {
    if (!patterns.some((regex) => regex.test(name))) return;
    const filePath = path.join(dir, name);
    try {
      await fs.unlink(filePath);
      console.log(`[cleanup-xmtp] removed ${path.relative(rootDir, filePath)}`);
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        console.warn(`[cleanup-xmtp] failed to remove ${filePath}:`, err.message || err);
      }
    }
  }));
}

(async () => {
  for (const target of targets) {
    await removeMatches(target.dir, target.patterns);
  }
})();
