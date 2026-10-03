const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  try {
    const count = await prisma.project.count();
    console.log('Project count: ' + count);
    if (count > 0) {
      const projects = await prisma.project.findMany({orderBy: {name: 'asc'}, select: {id:true, name:true, slug:true, type:true, status:true, baseUrl:true}});
      console.log('PROJECTS:');
      projects.forEach(p => console.log('  ' + p.slug + ' | ' + p.name + ' | ' + p.type + ' | ' + p.status + (p.baseUrl ? ' | ' + p.baseUrl : '')));
    } else {
      console.log('No projects in DB');
    }
    const users = await prisma.user.findMany({select: {id:true, email:true, name:true, isPlatformAdmin:true}});
    console.log('\nUSERS (' + users.length + '):');
    users.forEach(u => console.log('  ' + u.email + ' | ' + u.name + (u.isPlatformAdmin ? ' [ADMIN]' : '')));
  } catch(e) {
    console.log('Error: ' + e.message);
    console.log(e.stack);
  }
}
run().finally(() => prisma.$disconnect());
