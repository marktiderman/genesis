/// <reference types="vitest" />
/**
 * Vitest config for @marktiderman/genesis-ui-native.
 *
 * RN components are tested in a jsdom-style environment: react-native
 * primitives are aliased to a thin shim (test-utils/rn-mock.tsx) that
 * renders them as semantic HTML so @testing-library/react can drive
 * them with normal DOM events. This catches:
 *   - prop wiring (testID, accessibility roles)
 *   - logic bugs in state and reducers
 *   - basic interaction flows (press, change, dismiss)
 *
 * It does NOT catch native-module behavior (gorhom snap-points, picker
 * dialog, gesture-handler). Those live in Maestro / E2E coverage.
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./test-utils/setup.ts"],
  },
  resolve: {
    alias: {
      "react-native": path.resolve(__dirname, "test-utils/rn-mock.tsx"),
      "react-native-safe-area-context": path.resolve(
        __dirname,
        "test-utils/safe-area-mock.tsx"
      ),
      nativewind: path.resolve(__dirname, "test-utils/nativewind-mock.ts"),
    },
  },
});
