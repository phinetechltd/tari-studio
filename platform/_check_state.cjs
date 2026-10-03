const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const projects = await prisma.project.findMany({orderBy: {name: 'asc'}, select: {id:true, name:true, slug:true, type:true, status:true, baseUrl:true}});
  console.log('PROJECTS (' + projects.length + '):');
  projects.forEach(p => console.log('  ' + p.slug + ' | ' + p.name + ' | ' + p.type + ' | ' + p.status + (p.baseUrl ? ' | ' + p.baseUrl : '')));
  const users = await prisma.user.findMany({select: {id:true, email:true, name:true, isPlatformAdmin:true}});
  console.log('\nUSERS (' + users.length + '):');
  users.forEach(u => console.log('  ' + u.email + ' | ' + u.name + (u.isPlatformAdmin ? ' [ADMIN]' : '')));
  const stats = await prisma.issue.groupBy({by:['projectId','status'], _count:true});
  console.log('\nISSUES BY PROJECT/STATUS:');
  stats.forEach(s => console.log('  projectId=' + s.projectId + ' status=' + s.status + ' count=' + s._count));
}
run().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
