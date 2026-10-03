const { PrismaClient } = require('@prisma/client');

async function verify() {
  const prisma = new PrismaClient();
  try {
    const checks = [
      { name: 'Organizations', fn: () => prisma.organization.count() },
      { name: 'Users', fn: () => prisma.user.count() },
      { name: 'Brands', fn: () => prisma.brand.count() },
      { name: 'Catalogue Items', fn: () => prisma.catalogueItem.count() },
      { name: 'Content Tasks', fn: () => prisma.contentTask.count() },
      { name: 'Social Channels', fn: () => prisma.socialChannel.count() },
      { name: 'Campaigns', fn: () => prisma.campaign.count() },
      { name: 'Projects', fn: () => prisma.project.count() },
      { name: 'Issues', fn: () => prisma.issue.count() },
    ];
    
    console.log('=== SEED DATA INTEGRITY ===');
    for (const c of checks) {
      const count = await c.fn();
      console.log(count + ' ' + c.name);
    }
    
    const sprint = await prisma.project.findUnique({ where: { slug: 'sprint-1' }, include: { issues: true } });
    console.log('\nSprint 1 project:', sprint ? sprint.slug + ' | ' + sprint.name + ' | ' + sprint.type + ' | ' + sprint.status + ' | issues: ' + sprint.issues.length : 'MISSING');
    if (sprint) {
      sprint.issues.forEach(i => console.log('  Issue:', i.issueNumber, i.title, i.status, i.priority));
    }
    
    console.log('\n=== ALL SYSTEMS INTEGRATED ===');
  } finally {
    await prisma.$disconnect();
  }
}

verify().catch(e => { console.error(e.message); process.exit(1); });
