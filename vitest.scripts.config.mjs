import { defineConfig } from "vitest/config";

// Vitest config for the repo's OWN tooling in `scripts/`, which lives outside
// every workspace project and so is never reached by `pnpm -r test`. Wired into
// the root `test` script and, through it, into ci.yml's Unit tests step — a
// test that nothing runs is not a test.
//
// DELIBERATELY NOT NAMED `vitest.config.mjs`. Vitest searches upward for a
// config when the directory it runs in has none, so a root `vitest.config.mjs`
// is silently inherited by any workspace package that ships no config of its
// own. That package would then adopt this file's `include`, find nothing, and
// exit 1 — its real suite would never run.
// An off-name file is not auto-discovered; it is loaded only through the
// explicit `--config` in the root `test` / `test:scripts` scripts.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["scripts/__tests__/**/*.test.mjs"],
  },
});
