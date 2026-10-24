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

export default defineConfig({
  entry: { index: "src/index.ts", blocks: "src/blocks-entry.ts", node: "src/node.ts", react: "src/react.tsx" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: [/^@marktiderman\//, "react", "react-dom", "lucide-react", "zod", /^node:/],
  onSuccess: async () => stampUseClient("dist/react.js"),
});
