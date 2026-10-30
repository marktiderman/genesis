import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server/index.ts",
    targets: "src/targets/index.ts",
    client: "src/client/index.ts",
    // Next to client.js: the uploader starts it with new URL("./hash-worker.js", import.meta.url).
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
