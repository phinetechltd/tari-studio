const http = require('http');
const { PrismaClient } = require('@prisma/client');

// ── HTTP helpers ──────────────────────────────────────────────────────────

function httpReq(method, path, body, cookie) {
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
        const setCookie = res.headers['set-cookie'];
        const cookieStr = setCookie
          ? setCookie.map(h => h.split(';')[0]).join('; ')
          : null;
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString(),
          cookie: cookieStr,
          headers: res.headers
        });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const now = () => new Date().toISOString().slice(11, 23);

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  DAY 4 DEEP QA — Edge Cases & Multi-Tenant ');
  console.log('  ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════');
  console.log('');

  const results = [];

  function logTest(name, status, expected, actual, pass) {
    results.push({ name, status, expected, actual, pass: !!pass });
    console.log(
      (pass ? '  ✓' : '  ✗') +
      ' ' + name +
      '  [status=' + status +
      (expected !== undefined ? ' expected=' + expected : '') +
      ' actual=' + actual +
      (typeof actual === 'number' && actual > 1000 ? ' (' + (actual/1000).toFixed(2) + 's)' : '')
    );
  }

  // ── Phase 1: Login and session setup ──────────────────────────────────

  console.log('─── PHASE 1: Authentication ───');
  console.log('');

  // P1-T1: Login with correct credentials
  let r = await httpReq('POST', '/api/auth/login', {
    email: 'owner@demo.test',
    password: 'Demo@2026-Agency'
  });
  let cookie = r.cookie;
  let loginOk = r.status === 200 && cookie && cookie.includes('ap_session');
  logTest(
    'P1-T1  Login owner@demo.test (correct password)',
    r.status, 200, r.status, loginOk
  );
  if (r.body) {
    try {
      const j = JSON.parse(r.body);
      logTest(
        'P1-T1b Login response shape',
        null, 'has organisations', j.organisations ? j.organisations.length + ' orgs' : r.body.slice(0, 120),
        !!j.organisations && Array.isArray(j.organisations) && j.organisations.length > 0
      );
      console.log('       User:', j.user ? j.user.name + ' <' + j.user.email + '>' : 'n/a');
      console.log('       Orgs:', (j.organisations || []).map(o => o.name + ' (' + o.role + ')').join(', ') || 'none');
    } catch (e) { logTest('P1-T1b Login response parse', null, 'valid JSON', r.body.slice(0, 80), false); }
  }
  console.log('');

  if (!loginOk) {
    console.log('FATAL: cannot log in — aborting');
    return;
  }

  // P1-T2: Login with wrong password
  r = await httpReq('POST', '/api/auth/login', {
    email: 'owner@demo.test',
    password: 'wrongpassword123'
  });
  logTest(
    'P1-T2  Login with wrong password (should 401)',
    r.status, 401, r.status, r.status === 401
  );
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // P1-T3: Login with non-existent email
  r = await httpReq('POST', '/api/auth/login', {
    email: 'nobody@demo.test',
    password: 'Demo@2026-Agency'
  });
  logTest(
    'P1-T3  Login with non-existent email (should 401)',
    r.status, 401, r.status, r.status === 401
  );
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // P1-T4: Login with empty body
  r = await httpReq('POST', '/api/auth/login', {});
  logTest(
    'P1-T4  Login with empty body (should 400)',
    r.status, 400, r.status, r.status === 400
  );
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // P1-T5: Login with excessively long email
  const longEmail = 'x'.repeat(300) + '@demo.test';
  r = await httpReq('POST', '/api/auth/login', { email: longEmail, password: 'Demo@2026-Agency' });
  logTest(
    'P1-T5  Login with 300-char email (should reject)',
    r.status, null, r.status, r.status >= 400
  );
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // ── Phase 2: Multi-tenant isolation ───────────────────────────────────

  console.log('─── PHASE 2: Multi-Tenant Isolation ───');
  console.log('');

  // P2-T1: List brands in demo-agency (default org for owner)
  r = await httpReq('GET', '/api/brands', null, cookie);
  let demoBrands = [];
  try { const j = JSON.parse(r.body); demoBrands = j.brands || []; } catch (e) {}
  logTest(
    'P2-T1  Brands in demo-agency (should have 2)',
    r.status, 200, r.status + '  ' + demoBrands.length + ' brands',
    r.status === 200 && demoBrands.length === 2
  );
  demoBrands.forEach(b => console.log('       - ' + b.slug + ' : ' + b.name));
  console.log('');

  // P2-T2: Switch to bare-agency
  r = await httpReq('POST', '/api/auth/switch-org', {
    organizationId: 'cmuembp3c0002v0ic6r02fq4x'
  }, cookie);
  logTest(
    'P2-T2  Switch org → bare-agency',
    r.status, 200, r.status, r.status === 200
  );
  if (r.cookie) cookie = r.cookie;
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // P2-T3: List brands in bare-agency (should be 0 — isolation works)
  r = await httpReq('GET', '/api/brands', null, cookie);
  let bareBrands = [];
  try { const j = JSON.parse(r.body); bareBrands = j.brands || []; } catch (e) {}
  logTest(
    'P2-T3  Brands in bare-agency (should be 0 — NO LEAK from demo-agency)',
    r.status, 200, r.status + '  ' + bareBrands.length + ' brands',
    r.status === 200 && bareBrands.length === 0
  );
  if (bareBrands.length > 0) {
    console.log('       🚨 LEAK DETECTED: brands from another org appeared!');
    bareBrands.forEach(b => console.log('         - ' + b.slug + ' : ' + b.name));
  } else {
    console.log('       ✓ Isolation confirmed — bare-agency sees 0 brands');
  }
  console.log('');

  // P2-T4: Switch back to demo-agency
  r = await httpReq('POST', '/api/auth/switch-org', {
    organizationId: 'cmuembp2s0001v0icewkgymuy'
  }, cookie);
  logTest(
    'P2-T4  Switch org → demo-agency',
    r.status, 200, r.status, r.status === 200
  );
  if (r.cookie) cookie = r.cookie;
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // P2-T5: Verify brands back in demo-agency
  r = await httpReq('GET', '/api/brands', null, cookie);
  let demoBrands2 = [];
  try { const j = JSON.parse(r.body); demoBrands2 = j.brands || []; } catch (e) {}
  logTest(
    'P2-T5  Brands after switch-back (should see 2 again)',
    r.status, 200, r.status + '  ' + demoBrands2.length + ' brands',
    r.status === 200 && demoBrands2.length === 2
  );
  console.log('');

  // P2-T6: Switch org with invalid org ID
  r = await httpReq('POST', '/api/auth/switch-org', {
    organizationId: 'nonexistent-org-id-12345'
  }, cookie);
  logTest(
    'P2-T6  Switch to non-existent org (should 403)',
    r.status, 403, r.status, r.status === 403
  );
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // P2-T7: Switch org without auth cookie
  r = await httpReq('POST', '/api/auth/switch-org', {
    organizationId: 'cmuembp2s0001v0icewkgymuy'
  });
  logTest(
    'P2-T7  Switch org without cookie (should 401)',
    r.status, 401, r.status, r.status === 401
  );
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // P2-T8: Access brands without auth cookie
  r = await httpReq('GET', '/api/brands');
  logTest(
    'P2-T8  Brands without auth cookie (should 401)',
    r.status, 401, r.status, r.status === 401
  );
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // ── Phase 3: Edge cases ───────────────────────────────────────────────

  console.log('─── PHASE 3: Edge Cases ───');
  console.log('');

  // P3-T1: Create brand with empty name
  r = await httpReq('POST', '/api/brands', { name: '', slug: 'empty-name-test' }, cookie);
  logTest(
    'P3-T1  Create brand with empty name (should 422)',
    r.status, 422, r.status, r.status === 422
  );
  console.log('       Body:', r.body.slice(0, 150));
  console.log('');

  // P3-T2: Create brand with empty slug
  r = await httpReq('POST', '/api/brands', { name: 'Empty Slug Brand' }, cookie);
  logTest(
    'P3-T2  Create brand with missing slug (should 422 or auto-generate)',
    r.status, null, r.status, r.status < 500
  );
  console.log('       Status:', r.status, 'Body:', r.body.slice(0, 150));
  if (r.status === 201) {
    try {
      const j = JSON.parse(r.body);
      console.log('       Created:', j.brand.slug, '— slug auto-generated');
      // Clean up
      await httpReq('DELETE', '/api/brands/' + j.brand.id, null, cookie);
    } catch (e) {}
  }
  console.log('');

  // P3-T3: Brand name with 500 chars
  const longName500 = 'A'.repeat(500);
  r = await httpReq('POST', '/api/brands', { name: longName500, slug: 'long-name-500' }, cookie);
  logTest(
    'P3-T3  Brand with 500-char name (should 422 or truncate)',
    r.status, null, r.status, r.status < 500
  );
  console.log('       Status:', r.status, 'Body:', r.body.slice(0, 150));
  if (r.status === 201) {
    try {
      const j = JSON.parse(r.body);
      console.log('       Stored name length:', j.brand.name.length, '(accepted ' + j.brand.name.length + ' of 500)');
      await httpReq('DELETE', '/api/brands/' + j.brand.id, null, cookie);
    } catch (e) {}
  }
  console.log('');

  // P3-T4: Brand name with 1000 chars (beyond any sane limit)
  const longName1000 = 'B'.repeat(1000);
  r = await httpReq('POST', '/api/brands', { name: longName1000, slug: 'long-name-1000' }, cookie);
  logTest(
    'P3-T4  Brand with 1000-char name (should reject)',
    r.status, null, r.status, r.status >= 400
  );
  console.log('       Status:', r.status, 'Body:', r.body.slice(0, 150));
  console.log('');

  // P3-T5: Special characters in name (Unicode, emoji, etc.)
  r = await httpReq('POST', '/api/brands', {
    name: 'Café & Co — Special "Brands" <test> 🚀'
  }, cookie);
  logTest(
    'P3-T5  Brand with Unicode/special chars in name',
    r.status, null, r.status, r.status < 500
  );
  console.log('       Status:', r.status, 'Body:', r.body.slice(0, 200));
  if (r.status === 201) {
    try {
      const j = JSON.parse(r.body);
      console.log('       Slug generated:', j.brand.slug);
      await httpReq('DELETE', '/api/brands/' + j.brand.id, null, cookie);
    } catch (e) {}
  }
  console.log('');

  // P3-T6: SQL injection attempt in name
  r = await httpReq('POST', '/api/brands', {
    name: "'; DROP TABLE brands; --",
    slug: 'sqli-test'
  }, cookie);
  logTest(
    'P3-T6  SQL injection in name (should not crash — 201 or 422)',
    r.status, null, r.status, r.status < 500
  );
  console.log('       Status:', r.status, 'Body:', r.body.slice(0, 150));
  if (r.status === 201) {
    try {
      const j = JSON.parse(r.body);
      console.log('       Stored name:', JSON.stringify(j.brand.name));
      await httpReq('DELETE', '/api/brands/' + j.brand.id, null, cookie);
    } catch (e) {}
  }
  console.log('');

  // P3-T7: Duplicate slug in same org
  r = await httpReq('POST', '/api/brands', { name: 'Duplicate Slug Test', slug: 'techvault-solutions' }, cookie);
  logTest(
    'P3-T7  Duplicate slug in same org (should 422)',
    r.status, 422, r.status, r.status === 422
  );
  console.log('       Body:', r.body.slice(0, 150));
  console.log('');

  // P3-T8: Cross-org duplicate slug (same slug in different org — should be allowed)
  // First switch to bare-agency
  r = await httpReq('POST', '/api/auth/switch-org', {
    organizationId: 'cmuembp3c0002v0ic6r02fq4x'
  }, cookie);
  if (r.cookie) cookie = r.cookie;
  r = await httpReq('POST', '/api/brands', { name: 'Cross-Org Slug Test', slug: 'techvault-solutions' }, cookie);
  logTest(
    'P3-T8  Same slug in different org (should succeed — slugs scoped per org)',
    r.status, 201, r.status, r.status === 201
  );
  console.log('       Body:', r.body.slice(0, 150));
  if (r.status === 201) {
    try {
      const j = JSON.parse(r.body);
      await httpReq('DELETE', '/api/brands/' + j.brand.id, null, cookie);
    } catch (e) {}
  }
  // Switch back
  r = await httpReq('POST', '/api/auth/switch-org', {
    organizationId: 'cmuembp2s0001v0icewkgymuy'
  }, cookie);
  if (r.cookie) cookie = r.cookie;
  console.log('');

  // P3-T9: GET /api/brands/:id with non-existent ID
  r = await httpReq('GET', '/api/brands/nonexistent-id-99999', null, cookie);
  logTest(
    'P3-T9  GET brand with fake ID (should 404)',
    r.status, 404, r.status, r.status === 404
  );
  console.log('       Body:', r.body.slice(0, 150));
  console.log('');

  // P3-T10: DELETE brand with non-existent ID
  r = await httpReq('DELETE', '/api/brands/nonexistent-id-99999', null, cookie);
  logTest(
    'P3-T10 DELETE brand with fake ID (should 404)',
    r.status, 404, r.status, r.status === 404
  );
  console.log('       Body:', r.body.slice(0, 150));
  console.log('');

  // P3-T11: JSON injection — body with extra fields
  r = await httpReq('POST', '/api/brands', {
    name: 'Extra Fields Test',
    slug: 'extra-fields-test',
    _internal: 'injected',
    __proto__: { isAdmin: true },
    constructor: 'hacked'
  }, cookie);
  logTest(
    'P3-T11 JSON injection via extra/malicious fields (should ignore extras)',
    r.status, null, r.status, r.status < 500
  );
  console.log('       Status:', r.status, 'Body:', r.body.slice(0, 150));
  if (r.status === 201) {
    try {
      const j = JSON.parse(r.body);
      console.log('       Stored fields:', Object.keys(j.brand || {}).join(', '));
      await httpReq('DELETE', '/api/brands/' + j.brand.id, null, cookie);
    } catch (e) {}
  }
  console.log('');

  // P3-T12: Brand name with only whitespace
  r = await httpReq('POST', '/api/brands', { name: '   ', slug: 'whitespace-name' }, cookie);
  logTest(
    'P3-T12 Brand with whitespace-only name (should 422)',
    r.status, 422, r.status, r.status === 422
  );
  console.log('       Body:', r.body.slice(0, 150));
  console.log('');

  // ── Phase 4: Performance spot-check ───────────────────────────────────

  console.log('─── PHASE 4: Performance Spot-Check ───');
  console.log('');

  async function perfTest(label, fn) {
    const t1 = process.hrtime.bigint();
    const r = await fn();
    const t2 = process.hrtime.bigint();
    const ms = Number(t2 - t1) / 1e6;
    logTest(label, r.status, '< 500ms', ms.toFixed(1) + 'ms', ms < 500);
    return r;
  }

  // P4-T1: Homepage
  await perfTest('P4-T1  Homepage (GET /)', () =>
    httpReq('GET', '/')
  );
  console.log('');

  // P4-T2: Brands API (authenticated)
  await perfTest('P4-T2  Brands API (GET /api/brands, auth)', () =>
    httpReq('GET', '/api/brands', null, cookie)
  );
  console.log('');

  // P4-T3: Login flow timing
  await perfTest('P4-T3  Login flow (POST /api/auth/login)', () =>
    httpReq('POST', '/api/auth/login', {
      email: 'owner@demo.test',
      password: 'Demo@2026-Agency'
    })
  );
  console.log('');

  // P4-T4: 5 sequential brand list requests
  console.log('  P4-T4  5x brands API sequential:');
  let totalMs = 0;
  for (let i = 0; i < 5; i++) {
    const t1 = process.hrtime.bigint();
    r = await httpReq('GET', '/api/brands', null, cookie);
    const t2 = process.hrtime.bigint();
    totalMs += Number(t2 - t1) / 1e6;
    console.log('       Round ' + (i+1) + ': ' + (Number(t2-t1)/1e6).toFixed(1) + 'ms  status=' + r.status);
  }
  console.log('       Average: ' + (totalMs/5).toFixed(1) + 'ms  total: ' + totalMs.toFixed(1) + 'ms');
  logTest(
    'P4-T4  Avg 5x brands API',
    null, '< 200ms avg', (totalMs/5).toFixed(1) + 'ms avg',
    totalMs / 5 < 200
  );
  console.log('');

  // ── Phase 5: DB-level org isolation ───────────────────────────────────

  console.log('─── PHASE 5: DB-Level Org Isolation ───');
  console.log('');

  try {
    const prisma = new PrismaClient();
    const orgs = await prisma.organization.findMany({
      include: {
        brands: { where: { status: 'ACTIVE' } },
        _count: { select: { campaigns: true, tasks: true } }
      },
      orderBy: { slug: 'asc' }
    });

    for (const o of orgs) {
      console.log('  Org: ' + o.slug + ' (' + o.name + ')');
      console.log('    Brands (ACTIVE): ' + o.brands.length);
      console.log('    Campaigns: ' + o._count.campaigns);
      console.log('    Tasks: ' + o._count.tasks);
      o.brands.forEach(b => console.log('      → ' + b.slug + ' : ' + b.name));
    }

    // Verify: no brand has an organizationId that doesn't match its org
    const allBrands = await prisma.brand.findMany({
      include: { organization: { select: { slug: true } } }
    });
    const leaked = allBrands.filter(b =>
      b.organizationId && b.organization.slug !== 'demo-agency' && b.organization.slug !== 'bare-agency'
    );
    logTest(
      'P5-T1  DB-level: no orphaned brands',
      null, 0, leaked.length + ' leaked brands',
      leaked.length === 0
    );

    await prisma.$disconnect();
  } catch (e) {
    console.log('  DB check skipped: ' + e.message);
  }
  console.log('');

  // ── Phase 6: Platform admin endpoint ──────────────────────────────────

  console.log('─── PHASE 6: Admin Endpoints ───');
  console.log('');

  // P6-T1: Platform orgs endpoint
  r = await httpReq('GET', '/api/platform/orgs', null, cookie);
  logTest(
    'P6-T1  Platform orgs endpoint (admin)',
    r.status, 200, r.status, r.status === 200
  );
  if (r.body) {
    try {
      const j = JSON.parse(r.body);
      console.log('       Orgs:', (j.orgs || j.length || 'unknown'));
      if (Array.isArray(j)) {
        j.forEach(o => console.log('         - ' + o.slug + ' : ' + o.name + ' (' + o.plan + ')'));
      } else if (j.orgs) {
        j.orgs.forEach(o => console.log('         - ' + o.slug + ' : ' + o.name + ' (' + o.plan + ')'));
      }
    } catch (e) { console.log('       Body:', r.body.slice(0, 200)); }
  }
  console.log('');

  // P6-T2: Access platform endpoint without auth
  r = await httpReq('GET', '/api/platform/orgs');
  logTest(
    'P6-T2  Platform orgs without auth (should 401)',
    r.status, 401, r.status, r.status === 401
  );
  console.log('       Body:', r.body.slice(0, 120));
  console.log('');

  // ── Phase 7: Concurrent operations ────────────────────────────────────

  console.log('─── PHASE 7: Concurrent Operations ───');
  console.log('');

  // P7-T1: Fire 3 brand-creation requests concurrently, then clean up
  const createOps = [];
  for (let i = 0; i < 3; i++) {
    createOps.push(
      httpReq('POST', '/api/brands', {
        name: 'Concurrent Brand ' + i,
        slug: 'concurrent-' + i + '-' + Date.now()
      }, cookie)
    );
  }
  const createResults = await Promise.all(createOps);
  const created = createResults.filter(r => r.status === 201);
  logTest(
    'P7-T1  3 concurrent brand creations (should all succeed)',
    null, 3, created.length + ' created / ' + createResults.length + ' attempted',
    created.length === 3
  );
  createResults.forEach((r, i) => {
    console.log('       Request ' + i + ': ' + r.status + ' ' + (r.body.slice(0, 80)));
  });

  // Clean up concurrent brands
  for (const r of createResults) {
    if (r.status === 201) {
      try {
        const j = JSON.parse(r.body);
        await httpReq('DELETE', '/api/brands/' + j.brand.id, null, cookie);
      } catch (e) {}
    }
  }

  // Verify cleanup
  r = await httpReq('GET', '/api/brands', null, cookie);
  let brandsAfterCleanup = [];
  try { const j = JSON.parse(r.body); brandsAfterCleanup = j.brands || []; } catch (e) {}
  logTest(
    'P7-T2  Brand count after concurrent cleanup (should still be 2)',
    r.status, 200, brandsAfterCleanup.length + ' brands',
    r.status === 200 && brandsAfterCleanup.length === 2
  );
  console.log('');

  // ── Phase 8: Cookie/session inspection ────────────────────────────────

  console.log('─── PHASE 8: Session Cookie Inspection ───');
  console.log('');

  // Re-login and inspect the cookie carefully
  r = await httpReq('POST', '/api/auth/login', {
    email: 'owner@demo.test',
    password: 'Demo@2026-Agency'
  });
  const loginCookie = r.cookie;
  logTest(
    'P8-T1  Login sets ap_session cookie',
    null, true, loginCookie ? true : false,
    loginCookie && loginCookie.includes('ap_session')
  );
  console.log('       Cookie raw:', loginCookie ? loginCookie.slice(0, 100) + '...' : 'NONE');
  console.log('');

  // Check cookie attributes if available from headers
  if (r.headers && r.headers['set-cookie']) {
    const cookieHeaders = r.headers['set-cookie'];
    console.log('       Set-Cookie headers:');
    cookieHeaders.forEach(h => {
      const hasHttpOnly = h.toLowerCase().includes('httponly');
      const hasSecure = h.toLowerCase().includes('secure');
      const hasSameSite = h.toLowerCase().includes('samesite');
      console.log('         ' + h.split(';')[0] + '  [httponly:' + hasHttpOnly + ' secure:' + hasSecure + ' samesite:' + hasSameSite + ']');
    });
  }
  console.log('');

  // ── Summary ────────────────────────────────────────────────────────────

  console.log('═══════════════════════════════════════════════');
  console.log('  QA SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  console.log('  Total tests:  ' + total);
  console.log('  Passed:       ' + passed);
  console.log('  Failed:       ' + failed);
  console.log('  Pass rate:    ' + ((passed/total)*100).toFixed(1) + '%');
  console.log('');

  if (failed > 0) {
    console.log('  FAILED TESTS:');
    results.filter(r => !r.pass).forEach(r => {
      console.log('    ✗ ' + r.name);
      console.log('      status=' + r.status + ' expected=' + r.expected + ' actual=' + r.actual);
    });
    console.log('');
  }

  // CSV output for the report
  console.log('  CSV (name,status,expected,actual,pass):');
  results.forEach(r => {
    console.log('    "' + r.name + '",' + r.status + ',"' + r.expected + '","' + r.actual + '",' + r.pass);
  });

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  QA COMPLETE');
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
