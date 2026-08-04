/// <reference types="vitest" />
/**
 * Vitest config for @marktiderman/genesis-ui.
 *
 * Web components render in a happy-dom environment so
 * @testing-library/react can drive them with real DOM events — the same
 * convention @marktiderman/genesis-ui-native uses. Unlike ui-native there
 * is no react-native shim: these are real DOM components.
 *
 * The suite is intentionally thin. Its first job is the dual-context
 * regression guard (src/components/data/__tests__): proving the exported
 * data components read the SAME provider context that the exported
 * <GenesisProvider> populates. See that test for the failure it locks out.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./test-utils/setup.ts"],
  },
});
