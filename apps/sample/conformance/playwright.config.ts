/**
 * The conformance run (docs/RESPONSIVE.md, rule 10): the built sample and Storybook in Chromium,
 * WebKit and Firefox, at six widths and two zoom levels, with touch on phones and tablets.
 *
 *   pnpm --filter sample conformance              the per-PR scope (pull requests and main)
 *   CONFORMANCE_SCOPE=full pnpm --filter sample conformance   everything (nightly)
 *
 * Build first: `pnpm --filter sample build` and `pnpm --filter sample build-storybook`.
 */
import { defineConfig, type Project } from "@playwright/test";
import { ENGINES, allViewports, contextOptions, runsIn } from "@marktiderman/genesis-cli/verify";
import { PORTS, SCOPE } from "./pages";

// Per PR, stories run in Chromium and WebKit at three widths; the zoom viewports skip Firefox.
const STORY_VIEWPORTS = new Set(["320", "768", "1280"]);
const projects: Project[] = [];
for (const engine of ENGINES) {
  for (const viewport of allViewports()) {
    if (!runsIn(viewport, engine)) continue;
    const zoom = viewport.name.startsWith("zoom-") || viewport.name.startsWith("text-");
    const routes = SCOPE === "full" || !zoom || engine !== "firefox";
    const stories = SCOPE === "full" || (engine !== "firefox" && STORY_VIEWPORTS.has(viewport.name));
    const testMatch = [routes && "routes.spec.ts", stories && "stories.spec.ts"].filter(Boolean) as string[];
    if (!testMatch.length) continue;
    projects.push({
      name: `${engine}-${viewport.name}`,
      testMatch,
      metadata: { engine, viewport },
      use: { browserName: engine, ...contextOptions(viewport, engine) },
    });
  }
}

export default defineConfig({
  testDir: ".",
  outputDir: "../test-results/conformance",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A retry that passes is still reported as a failure: an intermittent check isn't a pass.
  failOnFlakyTests: !!process.env.CI,
  workers: process.env.CI ? 4 : undefined,
  timeout: 90_000,
  reporter: process.env.CI ? [["github"], ["blob"]] : [["list"]],
  globalTeardown: "./teardown.ts",
  use: {
    trace: "retain-on-failure",
  },
  projects,
  webServer: [
    {
      command: `node scripts/static-server.mjs build/client ${PORTS.site}`,
      cwd: "..",
      url: `http://127.0.0.1:${PORTS.site}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `node scripts/static-server.mjs storybook-static ${PORTS.storybook}`,
      cwd: "..",
      url: `http://127.0.0.1:${PORTS.storybook}/index.json`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
