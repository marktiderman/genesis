import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      server: "src/server/index.ts",
      signed: "src/signed/index.ts",
      // Resumable uploads (ADR 0012, primitive 4).
      "uploads/index": "src/uploads/index.ts",
      "uploads/server": "src/uploads/server/index.ts",
      "uploads/targets": "src/uploads/targets/index.ts",
      "uploads/client": "src/uploads/client/index.ts",
      // The browser condition of ./uploads/client: the same API, hashing in the worker below by default.
      "uploads/client-web": "src/uploads/client/web.ts",
      // The adapter for genesis-forms' upload port.
      forms: "src/forms/index.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    // Both builds write into dist/ at once, so neither cleans it: `pnpm build` empties it first.
    clean: false,
    treeshake: true,
    target: "es2022",
    external: [/^node:/],
  },
  {
    // The hashing worker: one standalone file next to uploads/client-web.js, with @noble/hashes
    // inside and no shared chunks to import, so a bundler can emit it as a worker as it is.
    entry: { "uploads/hash-worker": "src/uploads/client/hash-worker.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    splitting: false,
    treeshake: true,
    target: "es2022",
    noExternal: [/.*/],
  },
]);
