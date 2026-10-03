const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const user = await db.user.findUnique({ where: { email: 'owner@demo.test' }, select: { id: true, name: true, email: true, status: true, totpEnabledAt: true, passwordHash: true } });
  console.log(JSON.stringify(user, null, 2));
  await db.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
