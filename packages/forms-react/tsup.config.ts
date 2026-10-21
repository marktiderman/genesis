import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.tsx" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: ["react", "@marktiderman/genesis-forms"],
});
