import { defineConfig } from "tsup";

// Plain React Native styles (no className), so the JSX can be compiled and no Tailwind scanner
// needs to read dist/.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: ["react", "react-native", /^@marktiderman\/genesis-/],
});
