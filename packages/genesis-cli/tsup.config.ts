import { defineConfig } from "tsup";

// Two passes: library code (no shebang) + the CLI entry (with shebang).
export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      scaffolder: "src/scaffolder.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: "es2022",
    outExtension: () => ({ js: ".js" }),
    external: ["commander"],
  },
  {
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    target: "es2022",
    outExtension: () => ({ js: ".js" }),
    banner: { js: "#!/usr/bin/env node" },
    external: ["commander"],
  },
]);
