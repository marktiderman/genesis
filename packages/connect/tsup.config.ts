import { defineConfig } from "tsup";

// Server only (Node 20+, edge, Workers): fetch and WebCrypto, no dependencies. ESM and CJS.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    secrets: "src/secrets.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
});
