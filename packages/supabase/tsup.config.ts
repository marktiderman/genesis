import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", native: "src/native.ts", blocks: "src/blocks.ts", jobs: "src/jobs.ts", runner: "src/runner.ts", "web-handoff": "src/web-handoff.ts", "web-handoff-server": "src/web-handoff-server.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: ["@supabase/supabase-js", /^@marktiderman\//],
});
