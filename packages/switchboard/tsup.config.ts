import { defineConfig } from "tsup";

// Cross-runtime framework (Node + Deno + RN) — ship both ESM and CJS so any
// consumer can require or import it.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    gitdata: "src/gitdata.ts",
    "data-provider": "src/data-provider.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: "es2022",
  // @supabase/supabase-js and @marktiderman/genesis-core are optional peers —
  // never bundle them. node:fs / node:path stay external for the gitdata
  // adapter (Node-only).
  external: ["@supabase/supabase-js", "@marktiderman/genesis-core", "node:fs", "node:path"],
});
