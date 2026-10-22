import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest config for apps/sample.
 *
 * The `storybook` project turns every story under stories/ into a browser
 * test (render + play function + axe a11y check) via @storybook/addon-vitest,
 * running in headless Chromium through Vitest browser mode + Playwright.
 *
 * It deliberately does NOT extend ./vite.config.ts: that config carries the
 * React Router plugin, which Storybook can't host (see .storybook/main.ts).
 * storybookTest() applies the Storybook builder config, including viteFinal.
 *
 * Run: pnpm --filter sample test:storybook
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [storybookTest({ configDir: path.join(dirname, ".storybook") })],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
          setupFiles: ["./.storybook/vitest.setup.ts"],
        },
      },
    ],
  },
});
