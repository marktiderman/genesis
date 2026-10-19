import { defineConfig } from "tsup";

// One entry: everything here is interactive, so the whole bundle is a client
// module. The banner keeps a Next.js server component able to import it.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Rollup-based treeshaking strips the "use client" banner; esbuild keeps it.
  treeshake: false,
  target: "es2022",
  banner: { js: '"use client";' },
  external: [
    "react",
    "react-dom",
    "@tanstack/react-query",
    "lucide-react",
    /^@marktiderman\/genesis-/,
  ],
});
