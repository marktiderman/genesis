import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", blocks: "src/blocks.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: [/^@marktiderman\/genesis-/],
});
