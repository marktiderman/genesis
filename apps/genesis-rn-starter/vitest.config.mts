import { defineConfig } from "vitest/config";

// The starter's file and config tests; none of them runs React Native. The screens' component
// tests run on jest-expo (`jest.config.js`, `__tests__/components`), and `pnpm test` runs both.
export default defineConfig({
  test: { include: ["__tests__/**/*.test.ts"], exclude: ["__tests__/components/**", "**/node_modules/**"], environment: "node" },
});
