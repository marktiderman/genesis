import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

const DIRECTIVE = '"use client";';

/** The React entries re-export client components, so they keep genesis-config's `"use client"`. */
function stampUseClient(file: string) {
  const code = readFileSync(file, "utf8");
  if (!code.startsWith(DIRECTIVE)) writeFileSync(file, `${DIRECTIVE}\n${code}`);
}

// Every entry is a one-line re-export of the same subpath of @marktiderman/genesis-config, which
// stays external: dist/ holds pass-through modules only, never a second copy of the code.
export default defineConfig({
  entry: { index: "src/index.ts", blocks: "src/blocks.ts", gate: "src/gate.ts", "gate-react": "src/gate-react.ts", settings: "src/settings.ts", node: "src/node.ts", react: "src/react.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  target: "es2022",
  external: [/^@marktiderman\//],
  onSuccess: async () => {
    stampUseClient("dist/react.js");
    stampUseClient("dist/gate-react.js");
  },
});
