import { defineConfig } from "tsup";

// Server (`.`) and browser client (`./client`) ship from one package so the
// two ends of the wire protocol always move together. The client entry
// imports nothing server-side: no `postgres`, no `jose`, no credentials.
export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      client: "src/client.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: "es2022",
    external: ["@marktiderman/genesis-core", "jose", "postgres"],
  },
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    target: "es2022",
    banner: { js: "#!/usr/bin/env node" },
  },
]);
