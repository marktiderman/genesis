import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig } from "vite";

/**
 * Storybook config for apps/sample (web reference app).
 *
 * Stories live in apps/sample/stories/. Auto-discovers any
 * `*.stories.tsx` under that path. Stories render @marktiderman/genesis-ui
 * primitives — the same package the sample app consumes — so Chromatic
 * exercises the production component surface, not a parallel fork.
 *
 * PRD-07 Phase D-VR (DVR.4). Owner: Genesis framework team.
 *
 * NOTE: viteFinal explicitly resets plugins to a Storybook-compatible
 * set so Storybook does NOT inherit the React Router Vite plugin from
 * the production vite.config.ts. The RR plugin requires a config-file
 * shape Storybook can't supply, and crashes the build otherwise.
 */
const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: {
        viteConfigPath: ".storybook/vite.config.ts",
      },
    },
  },
  docs: { autodocs: false },
  typescript: {
    check: false,
    reactDocgen: false,
  },
  async viteFinal(config) {
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    return mergeConfig(config, {
      plugins: [tailwindcss()],
    });
  },
};

export default config;
