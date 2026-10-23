import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

const DIRECTIVE = '"use client";';

/**
 * The studio components hold state and effects, so the dist entry must open with
 * `"use client"` for a React Server Component to import it. A tsup `banner`
 * does not survive `treeshake` (rollup drops module-level directives; it did
 * here), so the directive is prepended after the build, as forms-builder does,
 * and the source map shifted down one line to match. The read-back check fails
 * the build if the directive is ever missing again.
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
  entry: { index: "src/index.ts", rules: "src/rules.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  external: [/^@marktiderman\//, "react", "react-dom", "radix-ui", "lucide-react"],
  onSuccess: async () => stampUseClient("dist/index.js"),
});
