import { defineConfig } from "tsup";

// Multi-entry build for @marktiderman/genesis-core.
// Subpath exports (./provider, ./hooks, ./hooks/*, ./storage) restored from
// skeleton single-entry after @marktiderman/genesis-ui re-consumed them.
export default defineConfig({
  entry: [
    "src/index.ts",
    "src/provider/index.ts",
    "src/hooks/index.ts",
    "src/hooks/*.ts",
    "src/storage/index.ts",
    "src/form-types.ts",
    "src/utils.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    "react",
    "react-dom",
    "@tanstack/react-query",
    "react-hook-form",
    "zod",
    "@hookform/resolvers",
  ],
});
