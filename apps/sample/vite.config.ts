import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { studioDevServer } from "./studio/vite-plugin";

export default defineConfig(({ mode }) => ({
  // react-router.config.ts's `basename` only prefixes routes; asset URLs
  // come from Vite's `base`. Keep the two in step. The Pages site is served
  // at the root of https://genesisone.dev, so both default to "/"; set
  // PAGES_BASE (e.g. "/genesis/") only to build for a subpath again.
  base: process.env.PAGES_BASE ?? "/",
  // The studio handler runs in the dev server only (`apply: "serve"`), so a
  // production build of this static sample is unchanged by it.
  plugins: [tailwindcss(), reactRouter(), studioDevServer(loadEnv(mode, process.cwd(), "STUDIO_"))],
  resolve: { tsconfigPaths: true },
  server: { port: 3200 },
}));
