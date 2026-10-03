const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', '.tmp_next.log');
console.log('Starting Next.js dev server...');

// start-server.cjs bug: execSync returns a string, not a stream.
// Calling .on('error', ...) on a string throws TypeError.
// execSync does NOT support the 'error' event — it throws synchronously
// on failure via try/catch, not via callback.
try {
  const proc = execSync(
    'node node_modules/next/dist/bin/next dev -p 3400 2>&1',
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 10 * 1024 * 1024,
    }
  );
  console.log('Server output received');
  console.log(proc.substring(0, 2000));
} catch (e) {
  console.error('Process error:', e.message);
  process.exit(1);
}
