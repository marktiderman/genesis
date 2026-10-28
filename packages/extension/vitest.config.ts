import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    // Surface frames point at chrome-extension:// pages: don't try to load them (happy-dom 21's default, kept explicit).
    environmentOptions: {
      happyDOM: { settings: { enableIframePageLoading: false } },
    },
    include: ["src/**/*.test.{ts,tsx}"],
    // Public types are tests too (src/**/*.test-d.ts), checked by tsc.
    typecheck: { enabled: true, include: ["src/**/*.test-d.ts"] },
  },
});
