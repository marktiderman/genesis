import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    runner: "src/runner/index.ts",
    server: "src/server/index.ts",
    email: "src/email/index.tsx",
    supabase: "src/supabase/index.ts",
    react: "src/react/index.tsx",
    web: "src/web/index.tsx",
    native: "src/native/index.tsx",
    blocks: "src/blocks.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: [/^@marktiderman\//, "react", "react-dom", /^react\//, "react-native", /^@tanstack\//, /^@react-email\//, "lucide-react", "@supabase/supabase-js"],
});
