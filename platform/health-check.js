const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();

async function run() {
  await p.$connect();

  console.log('=== DATABASE HEALTH CHECK ===');
  console.log('Connected:', process.env.DATABASE_URL ? 'YES' : 'NO (missing DATABASE_URL)');

  // Table counts
  const queries = [
    ['Organization', 'SELECT COUNT(*)::int as cnt FROM "Organization"'],
    ['User', 'SELECT COUNT(*)::int as cnt FROM "User"'],
    ['Brand', 'SELECT COUNT(*)::int as cnt FROM "Brand"'],
    ['ContentTask', 'SELECT COUNT(*)::int as cnt FROM "ContentTask"'],
    ['SocialChannel', 'SELECT COUNT(*)::int as cnt FROM "SocialChannel"'],
    ['Campaign', 'SELECT COUNT(*)::int as cnt FROM "Campaign"'],
    ['Project', 'SELECT COUNT(*)::int as cnt FROM "Project"'],
    ['ContentSubmission', 'SELECT COUNT(*)::int as cnt FROM "ContentSubmission"'],
    ['Membership', 'SELECT COUNT(*)::int as cnt FROM "Membership"'],
    ['Post', 'SELECT COUNT(*)::int as cnt FROM "Post"'],
    ['SocialPost', 'SELECT COUNT(*)::int as cnt FROM "SocialPost"'],
    ['CatalogueItem', 'SELECT COUNT(*)::int as cnt FROM "CatalogueItem"'],
    ['TrackedLink', 'SELECT COUNT(*)::int as cnt FROM "TrackedLink"'],
    ['Issue', 'SELECT COUNT(*)::int as cnt FROM "Issue"'],
  ];

  console.log('\n--- Table Row Counts ---');
  for (const [label, sql] of queries) {
    try {
      const [{ cnt }] = await p.$queryRawUnsafe(sql);
      console.log(label + ':', cnt);
    } catch (e) {
      console.log(label + ': ERROR - ' + e.message);
    }
  }

  // Detailed seed data
  console.log('\n--- Seed Data Details ---');

  const brands = await p.$queryRawUnsafe(`SELECT name, slug FROM "Brand" ORDER BY name`);
  console.log('\nBrands (' + brands.length + '):');
  if (brands.length === 0) console.log('  (none seeded yet — run prisma/seed-domain.ts)');
  brands.forEach(b => console.log('  -', b.name, '(' + b.slug + ')'));

  const ct = await p.$queryRawUnsafe(`SELECT title, status FROM "ContentTask" ORDER BY title`);
  console.log('\nContent Tasks (' + ct.length + '):');
  if (ct.length === 0) console.log('  (none seeded yet — run prisma/seed-domain.ts)');
  ct.forEach(t => console.log('  -', t.title, '[' + t.status + ']'));

  const sc = await p.$queryRawUnsafe(`SELECT name, platform FROM "SocialChannel" ORDER BY name`);
  console.log('\nSocial Channels (' + sc.length + '):');
  if (sc.length === 0) console.log('  (none seeded yet — run prisma/seed-domain.ts)');
  sc.forEach(c => console.log('  -', c.name, '(' + c.platform + ')'));

  const members = await p.$queryRawUnsafe(`
    SELECT u.name, u.email, o.name as org_name, o.slug, m.role
    FROM "Membership" m
    JOIN "User" u ON m."userId" = u.id
    JOIN "Organization" o ON m."organizationId" = o.id
    ORDER BY u.name
  `);
  console.log('\nMemberships (' + members.length + '):');
  if (members.length === 0) console.log('  (none)');
  members.forEach(m => console.log('  -', m.name, '<' + m.email + '> ->', m.org_name, '(' + m.slug + ')', '(' + m.role + ')'));

  const proj = await p.$queryRawUnsafe(`
    SELECT p.name, p.slug, p.type, p.status, p."baseUrl", u.name as owner_name, p."createdAt"::text
    FROM "Project" p
    LEFT JOIN "User" u ON p."ownerId" = u.id
    ORDER BY p."createdAt" DESC
    LIMIT 5
  `);
  console.log('\nProjects (' + proj.length + '):');
  proj.forEach(p => console.log('  -', p.name || '(unnamed)', '| slug:', p.slug, '| type:', p.type, '|', p.status, '| baseUrl:', p.baseUrl, '| owner:', p.owner_name, '|', p.createdAt));

  // Connection health
  console.log('\n--- Connection Health ---');
  const t0 = Date.now();
  await p.$queryRawUnsafe(`SELECT 1`);
  console.log('DB query latency:', (Date.now() - t0) + 'ms');

  await p.$disconnect();
  console.log('\n=== HEALTH CHECK COMPLETE ===');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
