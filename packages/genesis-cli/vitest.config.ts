/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["test/**/*.test.ts"],
    // test/introspect.test.ts type-checks emitted contracts with the real
    // TypeScript compiler, which blocks synchronously for several seconds
    // on a cold run (~7.5s measured). Vitest 2 let a blocking test overrun
    // the 5s default; Vitest 4 enforces it, so give these tests headroom.
    testTimeout: 30_000,
  },
});
