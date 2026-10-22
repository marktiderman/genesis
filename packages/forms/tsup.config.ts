import { defineConfig } from "tsup";

// Cross-runtime (browser, React Native, Node, edge) — ESM and CJS, no dependencies.
// Entries are bundled separately; the field-type registry lives on globalThis
// so they share it.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    testing: "src/testing.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
});
