import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  try {
    const brands = await db.brand.findMany({ take: 3, orderBy: { createdAt: "desc" }, include: { creator: { select: { name: true } } } });
    console.log("Brands count:", brands.length);
    if (brands.length) console.log("Brand:", JSON.stringify(brands[0], null, 2));
    const tasks = await db.contentTask.findMany({ take: 3, orderBy: { createdAt: "desc" } });
    console.log("ContentTasks count:", tasks.length);
    if (tasks.length) console.log("Task:", JSON.stringify(tasks[0], null, 2));
    const channels = await db.socialChannel.findMany({ take: 3, orderBy: { createdAt: "desc" } });
    console.log("Channels count:", channels.length);
    if (channels.length) console.log("Channel:", JSON.stringify(channels[0], null, 2));
    const campaigns = await db.campaign.findMany({ take: 3, orderBy: { createdAt: "desc" } });
    console.log("Campaigns count:", campaigns.length);
    if (campaigns.length) console.log("Campaign:", JSON.stringify(campaigns[0], null, 2));
    const items = await db.catalogueItem.findMany({ take: 3, orderBy: { createdAt: "desc" } });
    console.log("CatalogueItems count:", items.length);
    if (items.length) console.log("Item:", JSON.stringify(items[0], null, 2));
    console.log("DONE");
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
