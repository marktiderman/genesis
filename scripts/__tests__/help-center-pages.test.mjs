// genesis-support's public help center pages are genesis-sites' documents as plain data, since a
// module doesn't import another. This holds the two together, on the built packages.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const dist = (pkg, file) => path.resolve("packages", pkg, "dist", file);
const built = existsSync(dist("support", "index.js")) && existsSync(dist("sites", "index.js"));

describe.skipIf(!built)("help center pages on a site", () => {
  it("parse as pages and go into a site", async () => {
    const { helpCenterPages } = await import(pathToFileURL(dist("support", "index.js")).href);
    const sites = await import(pathToFileURL(dist("sites", "index.js")).href);
    const article = (id, slug, title, body, collectionId = null) => ({ id, slug, title, body, collectionId, summary: "A sentence or two.", status: "published", publishedAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" });
    const pages = helpCenterPages({
      collections: [{ id: "billing", title: "Billing", description: null, position: 0 }],
      articles: [article("a", "download-an-invoice", "Download an invoice", "Open Billing.\n\nPress Download.\nIt saves a file.", "billing"), article("b", "reset-your-password", "Reset your password", "Press Forgot password.")],
    });
    for (const page of pages) {
      const parsed = sites.PageDoc.safeParse(page.doc);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
    const store = sites.createMemorySiteStore();
    const { site } = sites.onePageSite ? sites.onePageSite({ name: "Acme", message: { headline: "Acme" } }) : { site: undefined };
    if (site) {
      const created = await store.createSite({ id: "acme", site, pages: pages.map((p) => ({ path: p.path, kind: p.kind, doc: p.doc })) });
      expect(created.pageIds.length).toBe(pages.length);
    }
  });
});
