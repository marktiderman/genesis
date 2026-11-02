import { defineConfig } from "tsup";

// Pure TypeScript, no React. `.` runs anywhere (browser, Node, edge); `/fetch` is server only and
// loads genesis-media (an optional peer) on first use. ESM and CJS, split so both entries share
// one copy of shared code.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    fetch: "src/fetch.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: ["@marktiderman/genesis-core", "@marktiderman/genesis-media"],
});
