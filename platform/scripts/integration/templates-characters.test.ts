import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import {
  addCharacterImages,
  characterImageFile,
  characterSchema,
  createCharacter,
  listCharacters,
  setCampaignCharacter,
} from "@/server/characters";
import { composePrompt, type QuoteMeta } from "@/server/studio";
import { sniffImage } from "@/server/storage";
import {
  addTemplateImages,
  createTemplate,
  getTemplate,
  listPublished,
  removeTemplateImage,
  templateContext,
  templateImageFile,
  templateSchema,
  updateTemplate,
} from "@/server/templates";

import { addMember, makeOrg, makeUser, principal, rejection } from "./_helpers";

// A 1x1 PNG, a JPEG header, and things that must be refused.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const file = (bytes: Uint8Array | string, name = "x.png", type = "image/png") => new File([bytes as BlobPart], name, { type });

describe("templates and characters", () => {
  let dir: string;
  const admin = principal({ role: "SUPER_ADMIN", organizationId: null, userId: "admin-user", mfa: true });

  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tari-store-"));
    process.env.STORAGE_DIR = path.relative(process.cwd(), dir);
    resetEnvCache();
  });
  after(async () => {
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  async function agency() {
    const org = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, org.id, "OWNER");
    return { org, p: principal({ role: "OWNER", organizationId: org.id, userId: user.id, mfa: true }) };
  }

  it("recognises images by their bytes, not their names", () => {
    assert.equal(sniffImage(PNG)?.mimeType, "image/png");
    assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.mimeType, "image/jpeg");
    assert.equal(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")), null);
    assert.equal(sniffImage(Buffer.from("<html>not an image</html>")), null);
  });

  describe("templates", () => {
    it("are admin-only to create and change", async () => {
      const { p } = await agency();
      const err = await rejection(() => createTemplate(p, templateSchema.parse({ title: "Market day", description: "Warm, busy, colourful market scenes." })));
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 403);
    });

    it("stay hidden as drafts and need an image before publishing", async () => {
      const t = await createTemplate(admin, templateSchema.parse({ title: "Fresh produce", description: "Bright, close-up produce on wooden crates." }));
      assert.ok(!(await listPublished()).some((x) => x.id === t.id));
      const noImage = await rejection(() => updateTemplate(admin, t.id, { status: "PUBLISHED" }));
      assert.ok(noImage instanceof ApiError);
      assert.equal(noImage.status, 422);

      await addTemplateImages(admin, t.id, [file(PNG, "a.png")], "Cover");
      await updateTemplate(admin, t.id, { status: "PUBLISHED" });
      const listed = (await listPublished()).find((x) => x.id === t.id);
      assert.ok(listed, "agencies now see it");
      assert.equal(listed.imageCount, 1);
      assert.ok(listed.cover);
    });

    it("refuse anything that is not a real image", async () => {
      const t = await createTemplate(admin, templateSchema.parse({ title: "Bad upload", description: "A template used to test uploads." }));
      const svg = await rejection(() => addTemplateImages(admin, t.id, [file("<svg><script>alert(1)</script></svg>", "evil.png")], null));
      assert.ok(svg instanceof ApiError);
      assert.equal(svg.status, 422);
      const big = await rejection(() => addTemplateImages(admin, t.id, [file(Buffer.concat([PNG, Buffer.alloc(11 * 1024 * 1024)]), "big.png")], null));
      assert.ok(big instanceof ApiError);
      assert.equal((await getTemplate(t.id, { includeDraft: true })).images.length, 0);
    });

    it("serve drafts to admins only, and published images to anyone signed in", async () => {
      const { p } = await agency();
      const t = await createTemplate(admin, templateSchema.parse({ title: "Serve test", description: "A template used to test serving." }));
      const [imageId] = await addTemplateImages(admin, t.id, [file(PNG)], null);
      assert.equal(await templateImageFile(p, imageId!), null, "a draft is invisible to an agency");
      assert.ok(await templateImageFile(admin, imageId!));
      await updateTemplate(admin, t.id, { status: "PUBLISHED" });
      const key = await templateImageFile(p, imageId!);
      assert.ok(key);
      assert.ok((await stat(path.join(dir, key!))).size > 0);
      const err = await rejection(() => getTemplate(t.id, { includeDraft: false }).then(() => removeTemplateImage(admin, t.id, imageId!)));
      assert.ok(err instanceof ApiError, "the last image of a published template cannot be removed");
    });

    it("add their hint (or description) in front of a prompt, keeping the user's words", async () => {
      const { org } = await agency();
      const t = await createTemplate(admin, templateSchema.parse({ title: "Hinted", description: "A long description of the look.", promptHint: "Golden hour, candid, warm tones." }));
      await addTemplateImages(admin, t.id, [file(PNG)], null);
      assert.equal(await templateContext(t.id), null, "drafts add nothing");
      await updateTemplate(admin, t.id, { status: "PUBLISHED" });
      const meta = { mode: "image", prompt: "A smiling shopkeeper", templateId: t.id, characterIds: [], aspectRatio: "1:1", seconds: null, parentAssetId: null } as unknown as QuoteMeta;
      assert.equal(await composePrompt(org.id, meta), "Golden hour, candid, warm tones. A smiling shopkeeper");
      const long = { ...meta, prompt: "x".repeat(1990) } as QuoteMeta;
      const composed = await composePrompt(org.id, long);
      assert.ok(composed.length <= 2000);
      assert.ok(composed.endsWith("x".repeat(1990)), "the user's text is never cut");
    });
  });

  describe("characters", () => {
    it("belong to one agency: others cannot see their images", async () => {
      const a = await agency();
      const b = await agency();
      const c = await createCharacter(a.p, characterSchema.parse({ name: "Mama Wanjiru", description: "Warm, yellow headwrap." }));
      const [imageId] = await addCharacterImages(a.p, c.id, [file(PNG)]);
      assert.ok(await characterImageFile(a.p, imageId!));
      assert.equal(await characterImageFile(b.p, imageId!), null);
      assert.equal((await listCharacters(b.org.id)).length, 0);
      const err = await rejection(() => addCharacterImages(b.p, c.id, [file(PNG)]));
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
    });

    it("only accept images and at most six", async () => {
      const a = await agency();
      const c = await createCharacter(a.p, characterSchema.parse({ name: "Baba Otieno" }));
      const bad = await rejection(() => addCharacterImages(a.p, c.id, [file("GIF89a not really", "x.png")]));
      assert.ok(bad instanceof ApiError);
      assert.equal(bad.status, 422);
      await addCharacterImages(a.p, c.id, Array.from({ length: 6 }, () => file(PNG)));
      const seventh = await rejection(() => addCharacterImages(a.p, c.id, [file(PNG)]));
      assert.ok(seventh instanceof ApiError);
    });

    it("go into the campaign and into the prompt", async () => {
      const a = await agency();
      const brand = await db.brand.create({ data: { organizationId: a.org.id, name: "Brand", slug: "brand", brandNumber: "BRD-1", createdById: a.p.userId } as never });
      const campaign = await db.campaign.create({
        data: { organizationId: a.org.id, brandId: brand.id, campaignNumber: "CMP-1", name: "Launch", source: "Direct", createdById: a.p.userId } as never,
      });
      const c = await createCharacter(a.p, characterSchema.parse({ name: "Mama Wanjiru", description: "A warm woman with a yellow headwrap." }));
      await setCampaignCharacter(a.p, campaign.id, c.id, true);
      assert.equal(await db.campaignCharacter.count({ where: { campaignId: campaign.id } }), 1);

      const meta = { mode: "image", prompt: "She sells tomatoes", characterIds: [c.id], aspectRatio: "1:1", seconds: null, parentAssetId: null } as unknown as QuoteMeta;
      assert.equal(await composePrompt(a.org.id, meta), "Character Mama Wanjiru: A warm woman with a yellow headwrap. She sells tomatoes");

      // Another agency's character id adds nothing.
      const other = await agency();
      assert.equal(await composePrompt(other.org.id, meta), "She sells tomatoes");
      const err = await rejection(() => setCampaignCharacter(other.p, campaign.id, c.id, true));
      assert.ok(err instanceof ApiError);

      await setCampaignCharacter(a.p, campaign.id, c.id, false);
      assert.equal(await db.campaignCharacter.count({ where: { campaignId: campaign.id } }), 0);
    });
  });
});
