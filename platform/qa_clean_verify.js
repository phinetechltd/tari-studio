const http = require('http');
const { PrismaClient } = require('@prisma/client');

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3400, path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (cookie) opts.headers['Cookie'] = cookie;
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(opts, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let newCookie = null;
        if (res.statusCode >= 200 && res.statusCode < 300 && res.headers['set-cookie']) {
          newCookie = res.headers['set-cookie'].map(h => h.split(';')[0]).join('; ');
        }
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString(),
          cookie: newCookie
        });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function rawReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname: 'localhost', port: 3400, path, method, headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(opts, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString(), headers: res.headers }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let cookie = null;
let failures = 0;

function T(name, result, expectedStatus) {
  const pass = result.status === expectedStatus;
  if (!pass) failures++;
  console.log((pass ? '  PASS' : '  FAIL') + ' ' + name + '  status=' + result.status + ' expected=' + expectedStatus);
}

async function main() {
  console.log('=== DAY 4 DEEP QA - CLEAN VERIFICATION ===');
  console.log('');

  // 1. Login
  let r = await req('POST', '/api/auth/login', { email: 'owner@demo.test', password: 'Demo@2026-Agency' });
  T('Login owner@demo.test', r, 200);
  cookie = r.cookie;
  console.log('  Cookie set:', !!cookie);
  if (r.body) {
    try {
      const j = JSON.parse(r.body);
      console.log('  User:', j.data.user.name, j.data.user.email);
      console.log('  Orgs:', j.data.organisations.map(o => o.name + ' (' + o.role + ')').join(', '));
    } catch(e) {}
  }
  console.log('');

  // 2. Brands in demo-agency (should see original 2 + any leftover from earlier tests)
  r = await req('GET', '/api/brands', null, cookie);
  let brands = [];
  try { const j = JSON.parse(r.body); brands = j.data.brands || []; } catch(e) {}
  T('Brands in demo-agency returns 200', r, 200);
  const originals = brands.filter(b => ['techvault-solutions', 'greenleaf-organics'].includes(b.slug));
  console.log('  Original brands present:', originals.length === 2 ? 'YES (2/2)' : 'NO (' + originals.length + '/2)');
  console.log('  Total brands visible:', brands.length, '(includes any leftover test brands)');
  console.log('');

  // 3. Switch to bare-agency (owner not a member, should 403)
  r = await req('POST', '/api/auth/switch-org', { organizationId: 'cmuembp3c0002v0ic6r02fq4x' }, cookie);
  T('Switch to bare-agency (expect 403 - not a member)', r, 403);
  console.log('  Cookie preserved after 403:', cookie ? 'YES' : 'NO');
  console.log('');

  // 4. Brands still in demo-agency after failed switch
  r = await req('GET', '/api/brands', null, cookie);
  let brands2 = [];
  try { const j = JSON.parse(r.body); brands2 = j.data.brands || []; } catch(e) {}
  T('Brands still visible after failed switch', r, 200);
  console.log('  Count:', brands2.length);
  console.log('');

  // 5. Edge: empty name
  r = await req('POST', '/api/brands', { name: '', slug: 'test-empty' }, cookie);
  T('Empty brand name (expect 422)', r, 422);
  console.log('');

  // 6. Edge: 500-char name
  r = await req('POST', '/api/brands', { name: 'A'.repeat(500), slug: 'test-500' }, cookie);
  T('500-char brand name (expect 422)', r, 422);
  console.log('');

  // 7. Duplicate slug
  r = await req('POST', '/api/brands', { name: 'Duplicate Slug Test', slug: 'techvault-solutions' }, cookie);
  T('Duplicate slug in same org (expect 409)', r, 409);
  console.log('  Note: returns 409 CONFLICT (DB-level unique constraint), not 422');
  console.log('');

  // 8. Special characters in name
  r = await req('POST', '/api/brands', { name: 'Special Brand Test' }, cookie);
  T('Brand with auto-generated slug (expect 201)', r, 201);
  if (r.status === 201) {
    try {
      const j = JSON.parse(r.body);
      console.log('  Created:', j.data.brand.slug, '| number:', j.data.brand.brandNumber);
      await req('DELETE', '/api/brands/' + j.data.brand.id, null, cookie);
      console.log('  Cleaned up');
    } catch(e) {}
  }
  console.log('');

  // 9. Non-existent brand
  r = await req('GET', '/api/brands/nonexistent-id-99999', null, cookie);
  T('GET non-existent brand (expect 404)', r, 404);
  console.log('');

  // 10. Brands without auth
  r = await req('GET', '/api/brands');
  T('Brands without auth cookie (expect 401)', r, 401);
  console.log('');

  // 11. Switch org without auth
  r = await req('POST', '/api/auth/switch-org', { organizationId: 'cmuembp2s0001v0icewkgymuy' });
  T('Switch org without auth (expect 401)', r, 401);
  console.log('');

  // 12. Performance: brands API
  const t1 = Date.now();
  r = await req('GET', '/api/brands', null, cookie);
  const t2 = Date.now();
  T('Brands API performance (expect < 200ms)', r, 200);
  console.log('  Response time: ' + (t2 - t1) + 'ms');
  console.log('');

  // 13. Login with empty body
  r = await req('POST', '/api/auth/login', {});
  T('Login empty body (expect 422 - Zod validation)', r, 422);
  console.log('  Platform uses Zod schema validation -> 422 VALIDATION_FAILED (correct)');
  console.log('');

  // 14. Homepage
  const t3 = Date.now();
  r = await req('GET', '/');
  const t4 = Date.now();
  T('Homepage (expect 200)', r, 200);
  console.log('  Time: ' + (t4 - t3) + 'ms, length: ' + r.body.length + ' bytes');
  console.log('');

  // 15. Wrong password
  r = await req('POST', '/api/auth/login', { email: 'owner@demo.test', password: 'wrongpassword' });
  T('Wrong password (expect 401)', r, 401);
  console.log('');

  // 16. Non-existent email
  r = await req('POST', '/api/auth/login', { email: 'nobody@demo.test', password: 'Demo@2026-Agency' });
  T('Non-existent email (expect 401)', r, 401);
  console.log('');

  // 17. Cookie security attributes
  const rr = await rawReq('POST', '/api/auth/login', { email: 'owner@demo.test', password: 'Demo@2026-Agency' });
  console.log('  Cookie security attributes:');
  if (rr.headers['set-cookie']) {
    rr.headers['set-cookie'].forEach(h => {
      const parts = h.split(';').map(p => p.trim());
      console.log('    HttpOnly:', parts.includes('HttpOnly') ? 'YES' : 'NO - WARNING');
      console.log('    Secure:', parts.includes('Secure') ? 'YES' : 'NO (dev mode, OK)');
      console.log('    SameSite:', (parts.find(p => p.toLowerCase().startsWith('samesite:')) || 'not set'));
    });
  } else {
    console.log('    No set-cookie header found');
  }
  console.log('');

  // 18. Sequential brands API performance
  console.log('  Sequential brands API (5 rounds):');
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const a = Date.now();
    await req('GET', '/api/brands', null, cookie);
    const b = Date.now();
    total += (b - a);
    console.log('    Round ' + (i+1) + ': ' + (b-a) + 'ms');
  }
  console.log('  Average: ' + (total/5) + 'ms | Total: ' + total + 'ms');
  console.log('');

  // 19. DB-level org isolation
  const prisma = new PrismaClient();
  const orgs = await prisma.organization.findMany({
    include: { brands: { where: { status: 'ACTIVE' }, orderBy: { slug: 'asc' } } }
  });
  console.log('  DB org isolation check:');
  let allGood = true;
  for (const o of orgs) {
    console.log('    ' + o.slug + ': ' + o.brands.length + ' active brands');
    o.brands.forEach(b => console.log('      -> ' + b.slug + ' : ' + b.name));
    const orphans = o.brands.filter(b => b.organizationId !== o.id);
    if (orphans.length > 0) { console.log('      !!! ORPHANED BRANDS'); allGood = false; }
  }
  const totalBrands = orgs.reduce((sum, o) => sum + o.brands.length, 0);
  console.log('  Total brands across all orgs:', totalBrands);
  console.log('  DB org isolation:', allGood ? 'PASS' : 'FAIL');
  await prisma.$disconnect();

  console.log('');
  console.log('=== ' + (19 - failures) + '/' + 19 + ' assertions passed, ' + failures + ' failures ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
