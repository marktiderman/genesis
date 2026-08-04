import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

/**
 * Storybook-only Vite config (Phase G).
 *
 * Storybook can't bootstrap the production vite.config.ts because the
 * React Router Vite plugin demands a config file shape that the
 * Storybook builder can't supply. This config strips RR and keeps
 * Tailwind v4 — Storybook needs Tailwind for Genesis components to
 * render correctly.
 */
export default defineConfig({
  plugins: [tailwindcss()],
});
