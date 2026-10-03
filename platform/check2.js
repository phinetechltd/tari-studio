const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to DB...');
  await prisma.\$connect();
  console.log('Connected.');
  
  const tables = ['organization', 'user', 'membership', 'brand', 'post', 'page', 'campaign', 'link', 'generatedAsset', 'contentTask'];
  for (const t of tables) {
    try {
      const c = await prisma.\$[t].count();
      console.log(t + ':', c);
    } catch(e) {
      if (e.message.includes('model') || e.message.includes('does not exist')) {
        console.log(t + ': NOT MIGRATED');
      } else {
        console.log(t + ': ERROR - ' + e.message);
      }
    }
  }
  
  await prisma.\$disconnect();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
