import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { createCategory, createPost, deleteCategory, deletePost, getPublicPost, listPosts, listPublicPosts, setPostStatus, updatePost } from "@/server/blog";

import { addMember, makeOrg, makeUser, principal, uid } from "./_helpers";

/**
 * The blog module, against the real test database: slugs stay unique, status
 * flows DRAFT -> PUBLISHED -> ARCHIVED, and only the operator organisation's
 * published posts are visible on the public side.
 */

async function ownerIn(orgId: string) {
  const { user } = await makeUser();
  await addMember(user.id, orgId, "OWNER");
  return principal({ userId: user.id, organizationId: orgId, role: "OWNER" });
}

describe("blog", () => {
  it("creates posts with unique slugs from the title", async () => {
    const org = await makeOrg();
    const p = await ownerIn(org.id);

    const first = await createPost(p, { title: "Hello, Nairobi!" });
    const second = await createPost(p, { title: "Hello, Nairobi!" });
    assert.equal(first.slug, "hello-nairobi");
    assert.equal(second.slug, "hello-nairobi-2");
    assert.equal(first.status, "DRAFT");

    // A custom slug wins, and another org may reuse the same slug.
    const custom = await createPost(p, { title: "Anything", slug: "My Custom Link" });
    assert.equal(custom.slug, "my-custom-link");
    const other = await makeOrg();
    const p2 = await ownerIn(other.id);
    const across = await createPost(p2, { title: "Hello, Nairobi!" });
    assert.equal(across.slug, "hello-nairobi");
  });

  it("flows DRAFT -> PUBLISHED -> DRAFT and refuses to delete a live post", async () => {
    const org = await makeOrg();
    const p = await ownerIn(org.id);
    const post = await createPost(p, { title: "Launch post" });

    const published = await setPostStatus(p, post.id, "PUBLISHED");
    assert.equal(published.status, "PUBLISHED");
    assert.ok(published.publishedAt);

    // publishedAt stays the first publish time after an unpublish/republish cycle
    const draft = await setPostStatus(p, post.id, "DRAFT");
    assert.equal(draft.status, "DRAFT");
    assert.equal(draft.publishedAt, null);
    const again = await setPostStatus(p, post.id, "PUBLISHED");
    assert.ok(again.publishedAt && published.publishedAt && again.publishedAt >= published.publishedAt);

    await assert.rejects(deletePost(p, post.id), /unpublish/i);
    await setPostStatus(p, post.id, "ARCHIVED");
    await deletePost(p, post.id);
    await assert.rejects(setPostStatus(p, post.id, "DRAFT"), /not found/i);
  });

  it("updates only the fields that were sent", async () => {
    const org = await makeOrg();
    const p = await ownerIn(org.id);
    const post = await createPost(p, { title: "Original title", excerpt: "First excerpt", body: "Some body text" });

    const renamed = await updatePost(p, post.id, { title: "A better title" });
    assert.equal(renamed.title, "A better title");
    assert.equal(renamed.excerpt, "First excerpt");
    assert.equal(renamed.body, "Some body text");
    assert.equal(renamed.slug, "original-title");
  });

  it("scopes everything to the caller's organisation", async () => {
    const org = await makeOrg();
    const other = await makeOrg();
    const p = await ownerIn(org.id);
    const outsider = await ownerIn(other.id);
    const post = await createPost(p, { title: "Secret draft" });
    const cat = await createCategory(p, { name: "Guides" });

    await assert.rejects(updatePost(outsider, post.id, { title: "Stolen" }), /not found/i);
    await assert.rejects(deletePost(outsider, post.id), /not found/i);
    await assert.rejects(deleteCategory(outsider, cat.id), /not found/i);
    // A foreign category id is never attached to this org's post.
    await assert.rejects(createPost(outsider, { title: "With foreign cat", categoryId: cat.id }), /does not exist/i);
    assert.equal((await listPosts(outsider)).length, 0);
  });

  it("links posts to categories and detaches them on category delete", async () => {
    const org = await makeOrg();
    const p = await ownerIn(org.id);
    const cat = await createCategory(p, { name: "Case studies" });
    const post = await createPost(p, { title: "A win", categoryId: cat.id });
    assert.equal(post.category?.slug, "case-studies");

    const cats = await listPosts(p, { categoryId: cat.id });
    assert.equal(cats.length, 1);

    await deleteCategory(p, cat.id);
    const after = await listPosts(p);
    assert.equal(after.length, 1);
    assert.equal(after[0].category, null);
  });

  it("shows only the operator organisation's published posts on the public blog", async () => {
    const slug = `org-${uid()}`;
    const operator = await makeOrg({ name: "Operator", status: "ACTIVE" });
    await db.organization.update({ where: { id: operator.id }, data: { slug } });
    const other = await makeOrg();
    const opPrincipal = await ownerIn(operator.id);
    const otherPrincipal = await ownerIn(other.id);

    const publicPost = await createPost(opPrincipal, { title: "Public hello", excerpt: "For everyone" });
    await setPostStatus(opPrincipal, publicPost.id, "PUBLISHED");
    const hidden = await createPost(opPrincipal, { title: "Hidden one", noindex: true });
    await setPostStatus(opPrincipal, hidden.id, "PUBLISHED");
    await createPost(opPrincipal, { title: "Still drafting" });
    const foreign = await createPost(otherPrincipal, { title: "Someone else's" });
    await setPostStatus(otherPrincipal, foreign.id, "PUBLISHED");

    const savedSlug = process.env.ORDERS_ORGANIZATION_SLUG;
    const savedBlog = process.env.BLOG_ORGANIZATION_SLUG;
    process.env.ORDERS_ORGANIZATION_SLUG = slug;
    delete process.env.BLOG_ORGANIZATION_SLUG;
    resetEnvCache();
    try {
      const listing = await listPublicPosts();
      assert.equal(listing.posts.length, 1);
      assert.equal(listing.posts[0].slug, "public-hello");
      const found = await getPublicPost("public-hello");
      assert.equal(found.post?.title, "Public hello");
      const draftGone = await getPublicPost("still-drafting");
      assert.equal(draftGone.post, null);
      const noindexGone = await getPublicPost("hidden-one");
      assert.equal(noindexGone.post?.noindex, true); // reachable by link, kept off the index
    } finally {
      if (savedSlug === undefined) delete process.env.ORDERS_ORGANIZATION_SLUG;
      else process.env.ORDERS_ORGANIZATION_SLUG = savedSlug;
      if (savedBlog === undefined) delete process.env.BLOG_ORGANIZATION_SLUG;
      else process.env.BLOG_ORGANIZATION_SLUG = savedBlog;
      resetEnvCache();
    }
  });
});
