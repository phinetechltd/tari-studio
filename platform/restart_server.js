const { execSync } = require('child_process');
const net = require('net');

// Find PID using port 3400 via Windows netstat
function findPidOnPort(port) {
  try {
    const out = execSync(`netstat -ano 2>NUL | findstr :${port}`, { timeout: 5000, windowsHide: true }).toString();
    const lines = out.trim().split('\n').filter(l => l.includes(`LISTENING`) || l.includes(`:${port}`));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid) && pid !== '0') return parseInt(pid);
    }
  } catch(e) { console.log('netstat failed:', e.message); }
  return null;
}

async function tryKill(pid) {
  try {
    execSync(`taskkill /PID ${pid}`, { timeout: 5000, windowsHide: true });
    console.log('Sent terminate to PID', pid);
    return true;
  } catch(e) {
    console.log('taskkill failed for', pid, ':', e.message);
    return false;
  }
}

async function main() {
  console.log('Checking port 3400...');
  
  const pid = findPidOnPort(3400);
  if (pid) {
    console.log('Found PID', pid, 'on port 3400');
    await tryKill(pid);
    await new Promise(r => setTimeout(r, 3000));
    
    // Check again
    const pid2 = findPidOnPort(3400);
    if (pid2) {
      console.log('PID', pid2, 'still on port 3400, trying again...');
      await tryKill(pid2);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  // Check if port is free
  const portFree = await new Promise(resolve => {
    const s = net.createConnection(3400, 'localhost', () => {
      console.log('PORT 3400 STILL OPEN');
      s.destroy();
      resolve(false);
    });
    s.on('error', () => resolve(true));
    setTimeout(() => { s.destroy(); resolve(true); }, 3000);
  });
  
  if (portFree) {
    console.log('Port 3400 is free. Starting next.js...');
    const { spawn } = require('child_process');
    const next = spawn('node', [
      'node_modules/.bin/next dev -p 3400'
    ].join(' ').split(' '), {
      cwd: 'C:/Users/ondie/Downloads/agency-platform/platform',
      shell: true,
      stdio: 'inherit'
    });
    
    // Wait for server to start
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const check = net.createConnection(3400, 'localhost');
        check.on('connect', () => {
          console.log('Server is up on port 3400!');
          process.exit(0);
        });
        check.on('error', () => {});
        setTimeout(() => { check.destroy(); }, 1000);
      } catch(e) {}
    }
    console.log('Server did not start in time');
    process.exit(1);
  } else {
    console.log('Port 3400 still in use. Cannot start server.');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
