const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const modelKeys = Object.keys(prisma).filter(k => 
    typeof prisma[k] === 'object' && prisma[k] !== null && 
    typeof prisma[k].count === 'function' && k[0] === k[0].toLowerCase()
  );
  console.log('Available models:', modelKeys.join(', '));
  console.log('Has catalogueItem:', 'catalogueItem' in prisma);
  console.log('Has product:', 'product' in prisma);
  console.log('Has contentTask:', 'contentTask' in prisma);
  console.log('Has socialChannel:', 'socialChannel' in prisma);
  console.log('Has campaign:', 'campaign' in prisma);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
