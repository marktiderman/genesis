import { defineConfig } from "tsup";

// Pure TypeScript, no React, fetch and WebCrypto only. `.` runs anywhere a server runs (Node 20+,
// edge, Workers). ESM only, like genesis-core/dates it imports.
export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: ["@marktiderman/genesis-core"],
});
