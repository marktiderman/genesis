/// <reference types="vitest" />
/**
 * Core and CLI tests run in Node. Native tests (`*.test.tsx`, each with a
 * `@vitest-environment happy-dom` line) alias React Native to the shim
 * genesis-ui-native's own tests use (its test-utils, reused, not copied) and
 * read genesis-ui-native from source, as genesis-support's tests do.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

const uiNative = path.resolve(import.meta.dirname, "../ui-native");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: [path.join(uiNative, "test-utils/setup.ts")],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "react-native": path.join(uiNative, "test-utils/rn-mock.tsx"),
      "react-native-safe-area-context": path.join(uiNative, "test-utils/safe-area-mock.tsx"),
      nativewind: path.join(uiNative, "test-utils/nativewind-mock.ts"),
      "@marktiderman/genesis-ui-native/components": path.join(uiNative, "src/components/index.ts"),
      "@marktiderman/genesis-ui-native/layouts": path.join(uiNative, "src/layouts/index.ts"),
      "@marktiderman/genesis-ui-native/hooks": path.join(uiNative, "src/hooks/index.ts"),
    },
  },
});
