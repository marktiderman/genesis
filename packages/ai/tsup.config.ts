import { defineConfig } from "tsup";

// `.` is types and definitions only (no provider SDK, no secrets). `/server` is the pipeline and
// the only entry that imports the AI SDK. `/anthropic` and `/openai` are the vendor adapters, `/supabase` is
// the store on the genesis_ai schema, and `/react` calls tasks by id.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server/index.ts",
    anthropic: "src/anthropic.ts",
    openai: "src/openai.ts",
    supabase: "src/supabase.ts",
    react: "src/react.tsx",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: ["ai", /^@ai-sdk\//, "zod", "react", /^react\//],
});
