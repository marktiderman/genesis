import { test } from "@playwright/test";
import { visit } from "./check";
import { ORIGINS, routeTargets, unvisitedPatterns } from "./pages";

for (const target of routeTargets()) {
  test(target.id, async ({ page }, info) => {
    await visit(page, ORIGINS.site, target, info);
  });
}

// Route patterns with no page to visit (no sitemap entry: a redirect, a splat, an editor-only
// route) are listed in the report rather than dropped.
test("route patterns not visited", async ({}, info) => {
  test.skip(info.project.name !== "chromium-1280", "listed once");
  for (const pattern of unvisitedPatterns()) info.annotations.push({ type: "skipped", description: `${pattern}: no page in the sitemap` });
});
