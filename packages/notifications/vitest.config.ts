/// <reference types="vitest" />
/**
 * Server, core and runner tests run in node; component tests opt into
 * happy-dom per file (`// @vitest-environment happy-dom`). React Native is
 * aliased to genesis-ui-native's test shim, and ui-native and genesis-native
 * are read from source, as genesis-native's own tests do.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

const uiNative = path.resolve(import.meta.dirname, "../ui-native");
const native = path.resolve(import.meta.dirname, "../native");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "react-native": path.join(uiNative, "test-utils/rn-mock.tsx"),
      "react-native-safe-area-context": path.join(uiNative, "test-utils/safe-area-mock.tsx"),
      nativewind: path.join(uiNative, "test-utils/nativewind-mock.ts"),
      "@marktiderman/genesis-ui-native/components": path.join(uiNative, "src/components/index.ts"),
      "@marktiderman/genesis-ui-native/layouts": path.join(uiNative, "src/layouts/index.ts"),
      "@marktiderman/genesis-native/push": path.join(native, "src/push/index.ts"),
    },
  },
});
