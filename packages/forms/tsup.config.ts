import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

// The runner is read from genesis-notifications' source, not its dist, so
// `pnpm --filter @marktiderman/genesis-forms build` works on a fresh clone
// without building notifications first. tsconfig.json maps the same path.
const runnerSource = fileURLToPath(new URL("../notifications/src/runner/index.ts", import.meta.url));
// The same for genesis-connect's secret box (`/secrets`, dependency-free), bundled in.
const secretsSource = fileURLToPath(new URL("../connect/src/secrets.ts", import.meta.url));

// Cross-runtime (browser, React Native, Node, edge) — ESM and CJS, no dependencies.
// The outbox runner is genesis-notifications' (`/runner`, itself dependency-free),
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
  noExternal: [/^@marktiderman\/genesis-notifications/, /^@marktiderman\/genesis-connect/],
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      "@marktiderman/genesis-notifications/runner": runnerSource,
      "@marktiderman/genesis-connect/secrets": secretsSource,
    };
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
});
