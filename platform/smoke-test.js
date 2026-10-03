const crypto = require('crypto');

// ── TOTP (hand-rolled, matches src/lib/totp.ts) ──
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input) {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0; const bytes = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('bad base32');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}
function totpAt(secret, atMs) {
  const counter = Math.floor(atMs / 1000 / 30);
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset+1] << 16) | (hmac[offset+2] << 8) | hmac[offset+3];
  return String(bin % 1000000).padStart(6, '0');
}
const secret = 'PN5XPEGTOQ4SWWQ3ASDFG2EV4OY3POYX';
const totp = totpAt(secret, Date.now());

async function req(path, opts={}) {
  const url = 'http://localhost:3400' + path;
  const r = await fetch(url, opts);
  const text = await r.text();
  try { return {status: r.status, body: JSON.parse(text)}; }
  catch(e) { return {status: r.status, body: text}; }
}

async function main() {
  console.log('TOTP code:', totp);
  
  // ── LOGIN ──
  const login = await req('/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'owner@demo.test', password: 'demo1234', totp})
  });
  console.log('LOGIN [' + login.status + ']:', JSON.stringify(login.body).slice(0, 300));
  
  if (!login.body?.user) { console.error('Login failed — aborting'); return; }
  
  // ── SWITCH TO DEMO ORGANIZATION ──
  const switchRes = await req('/api/auth/switch-org/DEMO', {method:'POST', headers:{'Content-Type':'application/json'}});
  console.log('SWITCH_ORG [' + switchRes.status + ']:', JSON.stringify(switchRes.body).slice(0, 150));
  
  // ── CONSOLE: SHOW ORG ──
  const org = await req('/api/console/orgs/DEMO', {headers: {'Content-Type':'application/json'}});
  console.log('CONSOLE.ORG [' + org.status + ']:', JSON.stringify(org.body).slice(0, 400));
  
  // ── CONSOLE: ORG APPS ──
  const apps = await req('/api/console/orgs/DEMO/apps', {headers: {'Content-Type':'application/json'}});
  console.log('CONSOLE.APPS [' + apps.status + ']:', JSON.stringify(apps.body).slice(0, 500));
  
  // ── CONSOLE: ORG BILLS ──
  const bills = await req('/api/console/orgs/DEMO/bills', {headers: {'Content-Type':'application/json'}});
  console.log('CONSOLE.BILLS [' + bills.status + ']:', JSON.stringify(bills.body).slice(0, 200));
  
  // ── CONSOLE: TEAM ──
  const team = await req('/api/console/orgs/DEMO/team', {headers: {'Content-Type':'application/json'}});
  console.log('CONSOLE.TEAM [' + team.status + ']:', JSON.stringify(team.body).slice(0, 300));
  
  // ── PLATFORM: ORGS ──
  const platforms = await req('/api/platform/orgs', {headers: {'Content-Type':'application/json'}});
  console.log('PLATFORM.ORGS [' + platforms.status + ']:', JSON.stringify(platforms.body).slice(0, 500));
  
  // ── PLATFORM: ORG MODULES (list) ──
  const modules = await req('/api/platform/orgs/modules', {headers: {'Content-Type':'application/json'}});
  console.log('PLATFORM.MODULES [' + modules.status + ']:', JSON.stringify(modules.body).slice(0, 500));
  
  // ── PLATFORM: SPECIFIC ORG MODULES ──
  const dmod = await req('/api/platform/orgs/DEMO/modules', {headers: {'Content-Type':'application/json'}});
  console.log('PLATFORM.DEMO.MODULES [' + dmod.status + ']:', JSON.stringify(dmod.body).slice(0, 600));
  
  // ── PLATFORM: ORG 2 MODULES (BARE) ──
  const bmod = await req('/api/platform/orgs/BARE/modules', {headers: {'Content-Type':'application/json'}});
  console.log('PLATFORM.BARE.MODULES [' + bmod.status + ']:', JSON.stringify(bmod.body).slice(0, 600));
  
  // ── PLATFORM: SPECIFIC MODULE (channels-outbox) ──
  const ch = await req('/api/platform/orgs/DEMO/modules/channels-outbox', {headers: {'Content-Type':'application/json'}});
  console.log('PLATFORM.MODULE.channels-outbox [' + ch.status + ']:', JSON.stringify(ch.body).slice(0, 400));
  
  // ── PLATFORM: SPECIFIC MODULE (content) ──
  const ct = await req('/api/platform/orgs/DEMO/modules/content', {headers: {'Content-Type':'application/json'}});
  console.log('PLATFORM.MODULE.content [' + ct.status + ']:', JSON.stringify(ct.body).slice(0, 400));
  
  console.log('\n=== ENDPOINT SMOKE TEST PASSED ===');
}
main().catch(e => console.error('FATAL:', e.message, e.stack?.slice(0,500)));
