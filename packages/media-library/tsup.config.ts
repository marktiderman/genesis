import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      server: "src/server/index.ts",
      targets: "src/targets/index.ts",
      client: "src/client/index.ts",
      // The browser condition of ./client: the same API, hashing in the worker below by default.
      "client-web": "src/client/web.ts",
      // Adapters for genesis-forms' and genesis-chat's upload ports.
      forms: "src/adapters/forms.ts",
      chat: "src/adapters/chat.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    // Both builds write into dist/ at once, so neither cleans it: `pnpm build` empties it first.
    clean: false,
    treeshake: true,
    target: "es2022",
  },
  {
    // The hashing worker: one standalone file next to client-web.js, with @noble/hashes inside
    // and no shared chunks to import, so a bundler can emit it as a worker as it is.
    entry: { "hash-worker": "src/client/hash-worker.ts" },
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
