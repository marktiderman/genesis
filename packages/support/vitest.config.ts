/// <reference types="vitest" />
/**
 * Core and web tests run in happy-dom as they are. Native tests alias React
 * Native to the shim genesis-ui-native's own tests use (its test-utils,
 * reused, not copied), and read genesis-ui-native from source. Native
 * modules (view-shot, the accelerometer, navigation, Supabase) are injected,
 * so tests pass fakes.
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
    // Whole chat threads render here (about 1.3 s locally); CI runners have taken over 5 s, vitest's default.
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
