import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server/index.ts",
    targets: "src/targets/index.ts",
    client: "src/client/index.ts",
    // The browser condition of ./client: the same API, hashing in the worker below by default.
    "client-web": "src/client/web.ts",
    tus: "src/client/tus-entry.ts",
    // Next to client-web.js: started with new URL("./hash-worker.js", import.meta.url).
    "hash-worker": "src/client/hash-worker.ts",
    compat: "src/compat/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
});
