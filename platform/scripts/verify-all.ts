import { PrismaClient } from "@prisma/client";
async function main() {
  const db = new PrismaClient();
  const org = await db.organization.findUnique({ where: { slug: "demo-agency" }, select: { id: true } });
  if (!org) { console.log("NO_ORG"); await db.$disconnect(); return; }

  const brands = await db.brand.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });
  console.log("\n=== BRANDS ===");
  for (const b of brands) {
    console.log(`  ${b.brandNumber} | ${b.name} | creator: ${b.createdById ?? "none"}`);
  }

  const tasks = await db.contentTask.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });
  console.log("\n=== CONTENT TASKS ===");
  for (const t of tasks) {
    console.log(`  ${t.taskNumber} | ${t.title} | ${t.status} | ${t.contentType}`);
  }

  const channels = await db.socialChannel.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });
  console.log("\n=== CHANNELS ===");
  for (const c of channels) {
    console.log(`  ${c.platform} | ${c.name} | ${c.handle ?? "no handle"}`);
  }

  const campaigns = await db.campaign.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });
  console.log("\n=== CAMPAIGNS ===");
  for (const c of campaigns) {
    console.log(`  ${c.campaignNumber} | ${c.name} | ${c.source} | $${c.budgetCents ? c.budgetCents / 100 : 0}`);
  }

  const items = await db.catalogueItem.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });
  console.log("\n=== CATALOGUE ITEMS ===");
  for (const i of items) {
    console.log(`  ${i.sku ?? "no sku"} | ${i.name} | $${i.priceCents ? i.priceCents / 100 : 0} | ${i.category ?? "no category"}`);
  }

  await db.$disconnect();
  console.log("\nDONE");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
