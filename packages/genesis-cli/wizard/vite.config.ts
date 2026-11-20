/**
 * Builds the setup wizard's page into dist/wizard, which `genesis setup` serves as static files
 * (no Vite at runtime). React, genesis-ui and the shared Settings screen are bundled in.
 */
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: here,
  base: "/",
  plugins: [tailwindcss()],
  // No inline script or style: the page is served under `default-src 'self'`.
  build: {
    outDir: fileURLToPath(new URL("../dist/wizard", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      // lucide-react marks its modules "use client"; a client-only page has no use for it.
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
  logLevel: "warn",
});
