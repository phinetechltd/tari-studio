// Domain seed: adds brands, catalogue items, and sample content to demo agencies
// Safe to re-run — upserts only, never deletes

try {
  process.loadEnvFile(".env");
} catch {
  // Environment may already be provided by the shell.
}

import { db } from "@/lib/db";
import type { ModuleKey } from "@/lib/modules";
import { nextNumber } from "@/lib/numbering";

const CHANNEL_DEFS = [
  { brandSlug: "techvault-solutions", platform: "FACEBOOK", name: "TechVault Official", handle: "techvaultke" },
  { brandSlug: "techvault-solutions", platform: "INSTAGRAM", name: "TechVault Kenya", handle: "techvault_kenya" },
  { brandSlug: "greenleaf-organics", platform: "FACEBOOK", name: "GreenLeaf Organics KE", handle: "greenleaforganicske" },
  { brandSlug: "greenleaf-organics", platform: "INSTAGRAM", name: "GreenLeaf Kenya", handle: "greenleaf_ke" },
];

const CAMPAIGN_DEFS = [
  { brandSlug: "techvault-solutions", name: "Q4 Cloud Services Push", source: "Google", budgetCents: 500000 },
  { brandSlug: "greenleaf-organics", name: "Holiday Season Promotion", source: "Facebook", budgetCents: 200000 },
];

export async function seedDemoAgency() {
  const demoOrg = await db.organization.findUnique({
    where: { slug: "demo-agency" },
    select: { id: true },
  });
  if (!demoOrg) {
    console.log("Demo Agency not found — skipping domain seed");
    return;
  }
  console.log(`Seeding domain data for Demo Agency (${demoOrg.id})...`);

  // Get the owner user for createdById
  const owner = await db.user.findFirst({
    where: {
      memberships: {
        some: {
          organizationId: demoOrg.id,
          role: "OWNER",
        },
      },
    },
    select: { id: true },
  });
  const ownerId = owner?.id ?? demoOrg.id;

  // ── Brands ──────────────────────────────────────────────────────
  const brandData = [
    {
      name: "TechVault Solutions",
      contactName: "Peter Kamau",
      contactEmail: "peter@techvault.co.ke",
      website: "https://techvault.co.ke",
      products: [
        { name: "Cloud Backup Package", sku: "TV-CB-001", priceCents: 50000, category: "Storage" },
        { name: "Data Centre Colocation", sku: "TV-DC-001", priceCents: 150000, category: "Infrastructure" },
        { name: "Managed IT Support", sku: "TV-MIT-001", priceCents: 35000, category: "Services" },
        { name: "Security Audit", sku: "TV-SA-001", priceCents: 85000, category: "Security" },
      ],
    },
    {
      name: "GreenLeaf Organics",
      contactName: "Wangari Njeri",
      contactEmail: "wangari@greenleaf.or.ke",
      website: "https://greenleaf.or.ke",
      products: [
        { name: "Organic Coffee Beans 1kg", sku: "GL-COF-001", priceCents: 2500, category: "Food & Beverage" },
        { name: "Tea Collection Box", sku: "GL-TEA-001", priceCents: 1800, category: "Food & Beverage" },
        { name: "Eco-friendly Packaging", sku: "GL-PKG-001", priceCents: 50000, category: "Sustainability" },
      ],
    },
  ];

  for (const b of brandData) {
    const slug = b.name.toLowerCase().replace(/\s+/g, "-");

    const existingBrand = await db.brand.findFirst({
      where: { organizationId: demoOrg.id, slug },
      select: { id: true, brandNumber: true },
    });
    if (existingBrand) continue;

    const brandNumber = await nextNumber(demoOrg.id, "BRAND");

    const brand = await db.brand.create({
      data: {
        organization: { connect: { id: demoOrg.id } },
        name: b.name,
        slug,
        brandNumber,
        contactName: b.contactName,
        contactEmail: b.contactEmail,
        website: b.website,
        creator: { connect: { id: ownerId } },
      },
    });

    // The counter owns the number; nothing else may guess one. Seeding through
    // nextNumber() keeps DocumentCounter in step with the rows it created, so
    // the first number a user's console issues can never collide with a seed.
    for (const p of b.products) {
      const existing = await db.catalogueItem.findFirst({
        where: { brandId: brand.id, sku: p.sku },
        select: { id: true },
      });
      if (existing) continue;

      const prod = await db.catalogueItem.create({
        data: {
          id: `seed-${brand.id}-${p.sku}`,
          brand: { connect: { id: brand.id } },
          organization: { connect: { id: demoOrg.id } },
          name: p.name,
          sku: p.sku,
          priceCents: p.priceCents,
          category: p.category,
          status: "ACTIVE",
        },
      });
    }
  }
  console.log("✓ Demo Agency brands and products seeded");

  // ── Content Tasks ────────────────────────────────────────────────
  const existingTasks = await db.contentTask.count({
    where: { organizationId: demoOrg.id },
  });
  if (existingTasks === 0) {
    const brands = await db.brand.findMany({
      where: { organizationId: demoOrg.id, status: "ACTIVE" },
      select: { id: true, name: true, slug: true },
    });
    if (brands.length > 0) {
      const taskDefs = [
        { brandSlug: "techvault-solutions", title: "Q4 Product Launch Campaign", contentType: "BRIEF", status: "APPROVED", priority: "HIGH", target: "Facebook" },
        { brandSlug: "techvault-solutions", title: "Social Media Content Calendar", contentType: "COPY", status: "IN_REVIEW", priority: "MEDIUM", target: "Instagram" },
        { brandSlug: "greenleaf-organics", title: "Brand Guidelines Update", contentType: "DESIGN", status: "DRAFT", priority: "LOW", target: null },
        { brandSlug: "greenleaf-organics", title: "WhatsApp Broadcast Messages", contentType: "COPY", status: "DRAFT", priority: "MEDIUM", target: null },
      ];

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const now = new Date();
      const currentMonth = monthNames[now.getMonth()];

      for (let i = 0; i < taskDefs.length; i++) {
        const def = taskDefs[i];
        const brand = brands.find((b) => b.slug === def.brandSlug);
        if (!brand) continue;

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (7 * (i + 1)));

        const creator = await db.user.findFirst({
          where: {
            memberships: {
              some: {
                organizationId: demoOrg.id,
                role: "OWNER",
              },
            },
          },
          select: { id: true },
        });

        await db.contentTask.create({
          data: {
            organizationId: demoOrg.id,
            brandId: brand.id,
            taskNumber: await nextNumber(demoOrg.id, "TASK"),
            title: def.title,
            description: `${def.title} — ${currentMonth} deliverables. ${brand.name} needs attention on this.`,
            contentType: def.contentType,
            status: def.status,
            priority: def.priority,
            dueAt: dueDate,
            targetPlatform: def.target,
            createdById: creator?.id ?? demoOrg.id,
          },
        });
      }
      console.log("✓ Demo Agency content tasks seeded");
    }
  }

  // ── Social Channels ─────────────────────────────────────────────
  const existingChannels = await db.socialChannel.count({
    where: { organizationId: demoOrg.id },
  });
  if (existingChannels === 0) {
    const brands = await db.brand.findMany({
      where: { organizationId: demoOrg.id },
      select: { id: true, slug: true },
    });
    if (brands.length > 0) {
      for (const ch of CHANNEL_DEFS) {
        const brand = brands.find((b) => b.slug === ch.brandSlug);
        if (!brand) continue;

        await db.socialChannel.create({
          data: {
            organizationId: demoOrg.id,
            brandId: brand.id,
            platform: ch.platform,
            name: ch.name,
            handle: ch.handle,
            externalId: null,
            status: "ACTIVE",
            connectedById: null,
          },
        });
      }
      console.log("✓ Demo Agency social channels seeded");
    }
  }

  // ── Campaigns ────────────────────────────────────────────────────
  const existingCampaigns = await db.campaign.count({
    where: { organizationId: demoOrg.id },
  });
  if (existingCampaigns === 0) {
    const brands = await db.brand.findMany({
      where: { organizationId: demoOrg.id },
      select: { id: true, slug: true },
    });
    for (const cp of CAMPAIGN_DEFS) {
      const brand = brands.find((b) => b.slug === cp.brandSlug);
      if (!brand) continue;

        const campaignNumber = await nextNumber(demoOrg.id, "CAMPAIGN");

      await db.campaign.create({
        data: {
          organizationId: demoOrg.id,
          brandId: brand.id,
          campaignNumber,
          name: cp.name,
          source: cp.source,
          budgetCents: cp.budgetCents,
          status: "ACTIVE",
          createdById: ownerId,
          utmParams: { utm_source: cp.source.toLowerCase(), utm_medium: "cpc", utm_campaign: cp.name.toLowerCase().replace(/\s+/g, "-") },
        },
      });
      }
    console.log("✓ Demo Agency campaigns seeded");
  }

  console.log("Domain seed complete!");
}

seedDemoAgency().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
