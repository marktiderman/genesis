import { defineConfig } from "tsup";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { buildCatalog } from "./src/blocks/catalog";
import { PACKED_GITIGNORE, STARTER_EXCLUDE, walk } from "./src/blocks/walk";

/**
 * What the CLI carries with it, so a published CLI works outside the monorepo:
 * dist/genesis-catalog.json (every Genesis package's version and block
 * manifests), dist/templates (templates/eas, maestro, ci) and dist/starter
 * (the files of apps/genesis-rn-starter an app owns), each the version this
 * CLI is released with.
 */
function bundleAssets() {
  writeFileSync("dist/genesis-catalog.json", `${JSON.stringify(buildCatalog(".."), null, 2)}\n`);
  rmSync("dist/templates", { recursive: true, force: true });
  cpSync("../../templates", "dist/templates", { recursive: true });
  const starter = "../../apps/genesis-rn-starter";
  rmSync("dist/starter", { recursive: true, force: true });
  if (existsSync(starter)) {
    for (const rel of walk(starter, STARTER_EXCLUDE)) {
      const to = `dist/starter/${rel.replace(/(^|\/)\.gitignore$/, `$1${PACKED_GITIGNORE}`)}`;
      mkdirSync(to.replace(/\/[^/]+$/, ""), { recursive: true });
      cpSync(`${starter}/${rel}`, to);
    }
    // The monorepo's pnpm settings (hoisted layout, allowed builds, one React); init drops its workspace list.
    cpSync("../../pnpm-workspace.yaml", "dist/starter/pnpm-workspace.yaml");
  }
  console.log("  assets ✔ catalog, templates, starter");
}

// Three passes: library code (no shebang), the lint pieces (ESM and CommonJS), the CLI entry (with shebang).
export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      scaffolder: "src/scaffolder.ts",
      doctor: "src/doctor/index.ts",
      vite: "src/vite.ts",
      expo: "src/expo.ts",
    },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    // Not tsup's clean: it runs per pass, and its declaration step would delete the other passes' .d.ts files. `build` empties dist first.
    clean: false,
    treeshake: true,
    minify: false,
    target: "es2022",
    outExtension: () => ({ js: ".js" }),
    external: ["commander", "postgres", "jiti", /^@marktiderman\//, /^@expo\//, "vite"],
  },
  {
    // The lint pieces apps load from eslint.config.js, which is often CommonJS: built for require and import.
    entry: { eslint: "src/eslint.ts" },
    format: ["esm", "cjs"],
    dts: true,
    shims: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    target: "es2022",
    outExtension: ({ format }) => ({ js: format === "cjs" ? ".cjs" : ".js" }),
  },
  {
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    target: "es2022",
    outExtension: () => ({ js: ".js" }),
    banner: { js: "#!/usr/bin/env node" },
    external: ["commander", "postgres", "jiti", /^@marktiderman\//, /^@expo\//, "vite"],
    onSuccess: async () => bundleAssets(),
  },
]);
