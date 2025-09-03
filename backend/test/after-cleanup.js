// @ts-check
// Global cleanup after backend tests: remove XMTP SQLite files in backend/ and frontend/
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const frontendDir = path.resolve(backendDir, '../frontend');

/**
 * Remove files matching xmtp-* that include .db3 in their names, including -wal/-shm.
 * @param {string} dir
 */
function removeXmtpDbFiles(dir) {
  try {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      if (!name.startsWith('xmtp-')) continue;
      if (!name.includes('.db3')) continue;
      const full = path.join(dir, name);
      try {
        fs.rmSync(full, { force: true });
      } catch (e) { console.warn(e) }
    }
  } catch (e) { console.warn(e) }
}

process.on('exit', () => {
  removeXmtpDbFiles(backendDir);
  removeXmtpDbFiles(frontendDir);
});

