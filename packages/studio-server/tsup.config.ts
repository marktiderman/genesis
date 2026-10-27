import { defineConfig } from "tsup";

// Server (`.`) and browser client (`./client`) ship from one package so the
// two ends of the wire protocol always move together. The client entry
// imports nothing server-side: no `postgres`, no `jose`, no credentials.
//
// `./auth` (token verification and the identity switch) also ships as
// CommonJS, for servers that build to CommonJS (NestJS's default). ESM is
// split so `.` and `./auth` share one copy of `IdentitySwitchError`: one
// thrown through either entry is `instanceof` the class the other exports.
//
// The three builds run in parallel and none of them cleans: a `clean` in one
// raced the others and deleted `auth.d.cts` after it was written. The
// `build` script empties `dist/` first instead.
export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      client: "src/client.ts",
      auth: "src/auth-entry.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    target: "es2022",
    external: ["@marktiderman/genesis-core", "jose", "postgres"],
  },
  {
    // CommonJS has only `./auth`, so there is nothing to share. `jose` stays
    // external: it is ESM-only, and Node loads it from CommonJS with
    // `require(esm)` (Node 20.19+ and 22.12+), so its security fixes still
    // arrive through the dependency rather than a copy bundled here.
    entry: { auth: "src/auth-entry.ts" },
    format: ["cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
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
