/// <reference types="vitest" />
/**
 * Components render in happy-dom with React Native aliased to the shim
 * genesis-ui-native's own tests use (its test-utils, reused, not copied), and
 * genesis-ui-native read from source so its JSX-preserving build isn't needed.
 * Native modules (splash, ErrorUtils, AsyncStorage, AppState) are injected, so
 * tests pass fakes.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

const uiNative = path.resolve(__dirname, "../ui-native");

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: [path.join(uiNative, "test-utils/setup.ts")],
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
