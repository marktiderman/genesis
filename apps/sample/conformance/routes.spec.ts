import { test } from "@playwright/test";
import { visit } from "./check";
import { ORIGINS, routeTargets } from "./pages";

for (const target of routeTargets()) {
  test(target.id, async ({ page }, info) => {
    await visit(page, ORIGINS.site, target, info);
  });
}
