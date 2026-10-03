const http = require('http');
const fs = require('fs');
const path = require('path');

const screenshotsDir = path.resolve(__dirname, 'scripts/browser/.screenshots');
const server = http.createServer((req, res) => {
  const reqPath = req.url === '/' ? 'dashboard-2026-09-21T18-21-14.png' : req.url.slice(1);
  const filePath = path.join(screenshotsDir, reqPath);
  if (!fs.existsSync(filePath) || !filePath.startsWith(screenshotsDir)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath);
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg' }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});
server.listen(3401, '127.0.0.1', () => {
  console.log('Screenshot server at http://localhost:3401/');
  console.log('Dashboard: http://localhost:3401/dashboard-2026-09-21T18-21-14.png');
  console.log('Login: http://localhost:3401/login-2026-09-21T18-21-14.png');
  console.log('Login TOTP: http://localhost:3401/login-with-totp-2026-09-21T18-21-14.png');
});
