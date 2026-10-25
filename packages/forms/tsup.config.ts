import { defineConfig } from "tsup";

// Cross-runtime (browser, React Native, Node, edge) — ESM and CJS, no dependencies.
// The outbox runner is genesis-notifications' (`/runner`, itself dependency-free),
// bundled in, so forms still installs nothing (its own types are written out).
// Entries are bundled separately; the field-type registry lives on globalThis
// so they share it.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    destinations: "src/destinations.ts",
    testing: "src/testing.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  noExternal: [/^@marktiderman\/genesis-notifications/],
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
});
