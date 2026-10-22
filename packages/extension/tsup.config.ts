import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

const DIRECTIVE = '"use client";';

/**
 * The React entry is hooks and components, so it opens with `"use client"`
 * (prepended after the build, as genesis-forms-react does: a tsup `banner`
 * doesn't survive treeshaking). The other entries are plain modules for the
 * service worker, content scripts and extension pages.
 */
function stampUseClient(file: string) {
  const code = readFileSync(file, "utf8");
  if (!code.startsWith(DIRECTIVE)) {
    writeFileSync(file, `${DIRECTIVE}\n${code}`);
    const mapFile = `${file}.map`;
    const map = JSON.parse(readFileSync(mapFile, "utf8")) as {
      mappings: string;
    };
    map.mappings = `;${map.mappings}`;
    writeFileSync(mapFile, JSON.stringify(map));
  }
  if (readFileSync(file, "utf8").split("\n", 1)[0] !== DIRECTIVE) {
    throw new Error(`${file} must start with ${DIRECTIVE}`);
  }
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "react/index": "src/react/index.tsx",
    "testing/index": "src/testing/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: ["react", /^@marktiderman\/genesis-ui/],
  onSuccess: async () => stampUseClient("dist/react/index.js"),
});
