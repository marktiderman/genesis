import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { studioDevServer } from "./studio/vite-plugin";

export default defineConfig(({ mode }) => ({
  // react-router.config.ts's `basename` only prefixes routes; asset URLs
  // come from Vite's `base`. Without it the GH Pages build loads /assets/*
  // from the domain root instead of /genesis/assets/* and renders blank.
  // Keep the two in step.
  base: process.env.GH_PAGES ? "/genesis/" : "/",
  // The studio handler runs in the dev server only (`apply: "serve"`), so a
  // production build of this static sample is unchanged by it.
  plugins: [tailwindcss(), reactRouter(), studioDevServer(loadEnv(mode, process.cwd(), "STUDIO_"))],
  resolve: { tsconfigPaths: true },
  server: { port: 3200 },
}));
