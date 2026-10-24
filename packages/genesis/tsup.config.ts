import { defineConfig } from "tsup";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// Umbrella package for @marktiderman/genesis. Holds NO code of its own —
// every entry is a one-line re-export barrel over a granular
// @marktiderman/genesis-* package. All granular packages (and react /
// react-native) stay external so `dist/` here contains only thin
// pass-through modules, never a duplicated copy of the real code.
//
// Subpaths mirror exactly what the dashboard needs today (ui/data,
// ui/utils, ui/status-colors, ui/hooks) plus each package's main entry
// and design-system's tokens/theme. `/native` re-exports
// @marktiderman/genesis-ui-native and `/native-app` re-exports
// @marktiderman/genesis-native (the app shell) — web bundlers never pull
// these in unless a consumer explicitly imports them, so react-native stays
// an optional peer.

// Every entry is a barrel; its .d.ts is emitted as a deterministic shim below.
const ENTRY = [
  "src/core.ts",
  "src/ui.ts",
  "src/ui-data.ts",
  "src/ui-patterns.ts",
  "src/ui-layout.ts",
  "src/ui-utils.ts",
  "src/ui-status-colors.ts",
  "src/ui-hooks.ts",
  "src/design-system.ts",
  "src/design-system-tokens.ts",
  "src/design-system-theme.ts",
  "src/switchboard.ts",
  "src/switchboard-gitdata.ts",
  "src/switchboard-data-provider.ts",
  "src/native.ts",
  "src/native-app.ts",
  "src/native-app-persist.ts",
  "src/forms.ts",
  "src/forms-server.ts",
  "src/forms-destinations.ts",
  "src/forms-react.ts",
  "src/forms-web.ts",
  "src/features.ts",
];

/**
 * The release train: the exact version of every Genesis package this umbrella
 * depends on (and so releases with), written to dist/versions.json. Packages
 * the umbrella doesn't depend on (the CLI, studio, supabase…) release on
 * their own and are left out, so their patches can't look like skew.
 * `genesis doctor` warns when an app that has this umbrella installed runs a
 * different version of any listed package.
 */
function writeReleaseManifest() {
  const own = JSON.parse(readFileSync("package.json", "utf8")) as { version: string; dependencies?: Record<string, string> };
  const deps = Object.keys(own.dependencies ?? {}).filter((name) => name.startsWith("@marktiderman/genesis-"));
  const versions = new Map<string, string>();
  for (const dir of readdirSync("..")) {
    const file = join("..", dir, "package.json");
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8")) as { name?: string; version?: string };
    if (pkg.name && pkg.version) versions.set(pkg.name, pkg.version);
  }
  const packages: Record<string, string> = {};
  for (const name of deps.sort()) {
    const version = versions.get(name);
    if (!version) throw new Error(`[umbrella] ${name} is a dependency but isn't in the workspace`);
    packages[name] = version;
  }
  writeFileSync("dist/versions.json", `${JSON.stringify({ version: own.version, packages }, null, 2)}\n`);
  console.log(`  versions.json ✔ ${deps.length} packages`);
}

export default defineConfig({
  entry: ENTRY,
  format: ["esm"],
  // DECLARATIONS: we do NOT use tsup's `dts` bundler here. Each barrel is a
  // pure `export * from "@marktiderman/genesis-*"` statement, which is itself
  // valid declaration content — so the correct .d.ts is a thin re-export, not a
  // re-bundle of the granular package's types. tsup's dts bundler has silently
  // DROPPED `ui.d.ts` (re-exporting the largest package, genesis-ui) between
  // builds, shipping a typeless `@marktiderman/genesis/ui` subpath (TS7016 for
  // strict consumers — this shipped in 0.2.0). The `onSuccess` step below emits
  // a deterministic thin .d.ts shim per entry instead: it cannot drop an entry,
  // duplicates no types, and always resolves to the granular package's own
  // declarations. See PKG umbrella-dts.
  dts: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom", "react-native", /^@marktiderman\/genesis-/],
  async onSuccess() {
    // A barrel .ts IS valid .d.ts content — copy each `src/<name>.ts` to
    // `dist/<name>.d.ts`. Deterministic: no dts entry can silently vanish.
    const missing = [];
    for (const src of ENTRY) {
      const name = basename(src).replace(/\.ts$/, "");
      const dts = `dist/${name}.d.ts`;
      try {
        copyFileSync(src, dts);
      } catch (err) {
        missing.push(`${dts} (${err instanceof Error ? err.message : err})`);
        continue;
      }
      if (!existsSync(dts)) missing.push(dts);
    }
    if (missing.length > 0) {
      throw new Error(
        `[umbrella] declaration shim emission failed for: ${missing.join(", ")}`,
      );
    }
    console.log(`  DTS ✔ ${ENTRY.length} thin re-export shims emitted`);
    writeReleaseManifest();
  },
});
