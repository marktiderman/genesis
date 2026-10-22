import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  banner: { js: '"use client";' },
  external: [/^@marktiderman\//, "react", "react-dom", "radix-ui", "lucide-react"],
});
