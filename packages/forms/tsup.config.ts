import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

// The runner is read from genesis-supabase's source, not its dist, so
// `pnpm --filter @marktiderman/genesis-forms build` works on a fresh clone
// without building genesis-supabase first. tsconfig.json and vitest.config.ts
// map the same path.
const runnerSource = fileURLToPath(new URL("../supabase/src/runner.ts", import.meta.url));

// Cross-runtime (browser, React Native, Node, edge) — ESM and CJS, no dependencies.
// The outbox runner is genesis-supabase's (`/runner`, itself dependency-free),
// bundled in, so forms still installs nothing (its own types are written out).
// Entries are bundled separately; the field-type registry lives on globalThis
// so they share it.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    destinations: "src/destinations.ts",
    testing: "src/testing.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  noExternal: [/^@marktiderman\/genesis-supabase\/runner$/],
  esbuildOptions(options) {
    options.alias = { ...options.alias, "@marktiderman/genesis-supabase/runner": runnerSource };
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
});
