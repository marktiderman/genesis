import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    sections: "src/sections/index.ts",
    web: "src/web/index.ts",
    supabase: "src/supabase/index.ts",
    blocks: "src/blocks.ts",
    editor: "src/editor/index.ts",
    import: "src/import/index.ts",
    templates: "src/templates/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  // scripts/build-assets.mjs empties dist and writes dist/assets first.
  clean: false,
  treeshake: true,
  target: "es2022",
  external: [/^@marktiderman\//, "react", "react-dom", /^react\//, /^react-dom\//, "zod", "lucide-react", "@supabase/supabase-js", /^@puckeditor\//],
});
