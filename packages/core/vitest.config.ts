import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "core" } },
      {
        // zod is a peer (^3 || ^4). Run the form-schema test against zod's v3 API
        // too (zod 4 ships it as `zod/v3`), so apps on zod 3 stay covered.
        test: { name: "zod-v3", include: ["src/hooks/__tests__/resource-form-schema.test.tsx"] },
        resolve: { alias: [{ find: /^zod$/, replacement: "zod/v3" }] },
      },
    ],
  },
});
