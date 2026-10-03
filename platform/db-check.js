const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const models = ['Organization','User','Brand','CatalogueItem','ContentTask','SocialChannel','SocialPost','Campaign','Project','ContentSubmission','Membership'];
  console.log('=== DATABASE HEALTH CHECK ===');
  for (const m of models) {
    try {
      const c = await prisma[m].count();
      console.log(m + ':', c);
    } catch(e) { console.log(m + ': ERROR -', e.message); }
  }
  console.log('');
  console.log('=== SEED DATA DETAILS ===');
  const brands = await prisma.brand.findMany({select:{name:true,slug:true}});
  console.log('Brands:');
  brands.forEach(b => console.log(' -', b.name, '(', b.slug, ')'));
  
  const ct = await prisma.contentTask.findMany({select:{title:true,status:true}});
  console.log('Content Tasks (' + ct.length + '):');
  ct.forEach(t => console.log(' -', t.title, '[' + t.status + ']'));
  
  const sc = await prisma.socialChannel.findMany({select:{name:true,channelType:true}});
  console.log('Social Channels (' + sc.length + '):');
  sc.forEach(c => console.log(' -', c.name, '(' + c.channelType + ')'));
  
  const members = await prisma.membership.findMany({
    include:{user:{select:{name:true,email:true}},organization:{select:{name:true,slug:true}},role:true}
  });
  console.log('Memberships (' + members.length + '):');
  members.forEach(m => console.log(' -', m.user.name, '→', m.organization.name, '(' + m.role + ')'));
  
  const proj = await prisma.project.count();
  console.log('Projects:', proj);
}
check().catch(e => console.error('FATAL:', e.message))
  .finally(() => prisma.$disconnect());
