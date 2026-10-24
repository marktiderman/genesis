import { defineConfig } from "vitest/config";

// The starter's tests read its files and config; none of them runs React Native.
export default defineConfig({
  test: { include: ["__tests__/**/*.test.ts"], environment: "node" },
});
