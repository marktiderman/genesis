import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The tests run on the same runner source the build bundles (tsup.config.ts),
// so every destinations and outbox test exercises genesis-supabase's engine itself.
const runnerSource = fileURLToPath(new URL("../supabase/src/runner.ts", import.meta.url));
// And on genesis-connect's secret box source, which the build bundles too.
const secretsSource = fileURLToPath(new URL("../connect/src/secrets.ts", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@marktiderman/genesis-supabase/runner": runnerSource,
      "@marktiderman/genesis-connect/secrets": secretsSource,
    },
  },
});
