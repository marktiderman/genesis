import { test } from "@playwright/test";
import { visit } from "./check";
import { ORIGINS, storyTargets } from "./pages";

for (const target of storyTargets()) {
  test(target.id, async ({ page }, info) => {
    await visit(page, ORIGINS.storybook, target, info);
  });
}
