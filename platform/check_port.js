const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 3401,
  path: '/api/health',
  method: 'GET',
  timeout: 5000
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('HTTP ' + res.statusCode + ' ' + d.slice(0, 200));
    process.exit(0);
  });
});
req.on('error', e => {
  console.log('ERR: ' + e.message);
  process.exit(1);
});
req.end();
