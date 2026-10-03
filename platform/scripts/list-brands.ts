import { PrismaClient } from "@prisma/client";
async function main() {
  const db = new PrismaClient();
  const brands = await db.brand.findMany({ orderBy: { createdAt: "asc" } });
  console.log("All brands:");
  for (const b of brands) {
    console.log(`  ${b.id} | ${b.brandNumber} | ${b.name} | ${b.slug}`);
  }
  const org = await db.organization.findUnique({ where: { slug: "demo-agency" }, select: { id: true } });
  if (org) {
    const brandsInOrg = await db.brand.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });
    console.log("\nBrands in demo agency:");
    for (const b of brandsInOrg) {
      console.log(`  ${b.id} | ${b.brandNumber} | ${b.name} | ${b.slug}`);
    }
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
