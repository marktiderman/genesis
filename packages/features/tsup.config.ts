import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

const DIRECTIVE = '"use client";';

/**
 * `FeatureList` holds filter state, so `dist/react.js` must open with
 * `"use client"` for a React Server Component to import it. Rollup drops a
 * module-level directive under `treeshake`, so it is prepended after the
 * build, as forms-devtools does, and the source map shifted one line to match.
 */
function stampUseClient(file: string) {
  const code = readFileSync(file, "utf8");
  if (!code.startsWith(DIRECTIVE)) {
    writeFileSync(file, `${DIRECTIVE}\n${code}`);
    const mapFile = `${file}.map`;
    const map = JSON.parse(readFileSync(mapFile, "utf8")) as { mappings: string };
    map.mappings = `;${map.mappings}`;
    writeFileSync(mapFile, JSON.stringify(map));
  }
  if (readFileSync(file, "utf8").split("\n", 1)[0] !== DIRECTIVE) {
    throw new Error(`${file} must start with ${DIRECTIVE}`);
  }
}

const ESM_ENTRIES = { index: "src/index.ts", blocks: "src/blocks-entry.ts", gate: "src/gate-entry.ts", settings: "src/settings-entry.ts", "settings-protocol": "src/settings-protocol.ts", setup: "src/setup.ts", "settings-react": "src/settings-react.tsx", "gate-react": "src/gate-react.tsx", node: "src/node.ts", react: "src/react.tsx" };

/**
 * The React-free entries also ship as CommonJS (`require` condition). The Expo
 * config plugin in genesis-cli reads `/settings`, and Expo loads plugins with
 * `require` (through tsx/cjs or its own transpiler), so an `import`-only export
 * fails there with "Package subpath './settings' is not defined by exports".
 */
const CJS_ENTRIES = { index: "src/index.ts", blocks: "src/blocks-entry.ts", gate: "src/gate-entry.ts", settings: "src/settings-entry.ts", "settings-protocol": "src/settings-protocol.ts", setup: "src/setup.ts", node: "src/node.ts" };

const EXTERNAL = [/^@marktiderman\//, "react", "react-dom", "lucide-react", "zod", /^node:/];

// Two passes. Not tsup's clean: it runs per pass and would delete the other pass's files; `build` empties dist first.
export default defineConfig([
  {
    entry: ESM_ENTRIES,
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: "es2022",
    external: EXTERNAL,
    onSuccess: async () => {
      stampUseClient("dist/react.js");
      stampUseClient("dist/gate-react.js");
      stampUseClient("dist/settings-react.js");
    },
  },
  {
    entry: CJS_ENTRIES,
    format: ["cjs"],
    // Shared chunks, as the ESM pass has: one FeatureOff, one SettingsError, so `instanceof` holds
    // across `require(".")`, `require("./gate")` and `require("./settings")`.
    splitting: true,
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: "es2022",
    external: EXTERNAL,
    outExtension: () => ({ js: ".cjs", dts: ".d.cts" }),
  },
]);
