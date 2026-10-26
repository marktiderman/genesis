/// <reference types="vitest" />
/**
 * Components render in happy-dom with React Native aliased to genesis-ui-native's shim (its
 * test-utils, reused through ./test-utils/rn-mock.tsx, which adds the few APIs a form needs:
 * accessibility announcements and focus, Keyboard, AppState). genesis-ui-native is read from
 * source, so its JSX-preserving build isn't needed.
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
    // Whole forms render through several async steps; a loaded CI runner has needed more than the 5 s default.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "react-native": path.resolve(__dirname, "test-utils/rn-mock.tsx"),
      "react-native-safe-area-context": path.join(uiNative, "test-utils/safe-area-mock.tsx"),
      nativewind: path.join(uiNative, "test-utils/nativewind-mock.ts"),
      "@marktiderman/genesis-ui-native/hooks": path.join(uiNative, "src/hooks/index.ts"),
      "@marktiderman/genesis-ui-native/layouts": path.join(uiNative, "src/layouts/index.ts"),
    },
  },
});
