// Builds a See it preview: a static page from the workspace's own packages.
// Copy this file and your demo folder into apps/sample (its node_modules has the plugins), then,
// from apps/sample: SEE_IT=see-it-<name> ../../node_modules/.bin/vite build -c vite.see-it.config.ts
// The page lands in apps/sample/see-it-<name>-dist. Delete all three when you've published.
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = process.env.SEE_IT;
if (!root) throw new Error("Set SEE_IT to the demo folder's name, e.g. SEE_IT=see-it-board");

export default defineConfig({
  root,
  base: "./",
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  build: { outDir: `../${root}-dist`, emptyOutDir: true, assetsInlineLimit: 0 },
});
