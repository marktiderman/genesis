import { defineConfig } from "tsup";

// Server only (Node 20+, edge, Workers): fetch and WebCrypto, no dependencies. ESM and CJS.
// Split, in both formats, so `.` and `/secrets` share one copy of the secret box:
// a SecretError thrown by one is `instanceof` the class the other exports.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    secrets: "src/secrets.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
});
