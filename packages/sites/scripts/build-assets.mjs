#!/usr/bin/env node
/**
 * Builds the files a site page loads, then writes them into
 * `src/web/assets.generated.ts` so the request handler serves them from
 * memory on any runtime (Node, edge, a Vercel function) with no file system:
 *
 *   sites.<hash>.css        every section's classes (Tailwind v4, minified)
 *   sites-forms.<hash>.css  what a genesis-forms <Form> needs; linked only with a form
 *   form-island.<hash>.js   React + forms-web, hydrating the server-rendered form
 *   islands.<hash>.js       the loader: phone menu, and the form island on demand (budget 5 KB)
 *   font-<id>-<weight>.<hash>.woff2
 *                           every self-hosted font file (src/core/fonts.ts), latin subset, from
 *                           its @fontsource package; the bodies go in `fonts.generated.ts` (no
 *                           copies in dist), which the handler imports only to answer a font request
 *
 * The fonts' licences (all SIL OFL 1.1) land in `dist/assets/fonts/LICENSES.txt`.
 * Copies also land in `dist/assets/` (the package's `./sites.css` export).
 * `--if-missing` skips the build when the generated module already exists
 * (tests and typecheck run it that way).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const generated = join(pkg, "src/web/assets.generated.ts");
const fontsGenerated = join(pkg, "src/web/fonts.generated.ts");
if (process.argv.includes("--if-missing") && existsSync(generated) && existsSync(fontsGenerated)) process.exit(0);

const require = createRequire(join(pkg, "package.json"));
// A fresh dist: tsup runs after this with `clean: false`, so it keeps these assets.
rmSync(join(pkg, "dist"), { recursive: true, force: true });
const out = join(pkg, "dist/assets");
mkdirSync(out, { recursive: true });

const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 10);
const LOADER_BUDGET = 5 * 1024;

function tailwind(input) {
  const cliPkg = require.resolve("@tailwindcss/cli/package.json");
  const bin = join(dirname(cliPkg), JSON.parse(readFileSync(cliPkg, "utf8")).bin.tailwindcss);
  const file = join(out, `.tmp-${hash(input)}.css`);
  execFileSync(process.execPath, [bin, "-i", join(pkg, input), "-o", file, "--minify"], { cwd: pkg, stdio: ["ignore", "ignore", "inherit"] });
  const text = readFileSync(file, "utf8");
  unlinkSync(file);
  return text;
}

async function bundle(entry, define = {}) {
  const result = await build({
    entryPoints: [join(pkg, entry)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "none",
    logLevel: "error",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', ...define },
  });
  return result.outputFiles[0].text;
}

const css = tailwind("src/web/sites.css");
const formsWebCss = readFileSync(require.resolve("@marktiderman/genesis-forms-web/styles.css"), "utf8");
const formsCss = `${tailwind("src/web/sites-forms.css")}\n${formsWebCss}`;
const formIsland = await bundle("src/islands/form-island.tsx");
const formIslandName = `form-island.${hash(formIsland)}.js`;
const islands = await bundle("src/islands/loader.ts", { __FORM_ISLAND__: JSON.stringify(`./${formIslandName}`) });
if (Buffer.byteLength(islands) > LOADER_BUDGET) {
  throw new Error(`The islands loader is ${Buffer.byteLength(islands)} bytes; its budget is ${LOADER_BUDGET}.`);
}

// The font table, read from the source so the two never disagree.
const fontsModule = await build({ entryPoints: [join(pkg, "src/core/fonts.ts")], bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "error" });
const { SELF_HOSTED_FONTS, fontFileKey } = await import(`data:text/javascript;base64,${Buffer.from(fontsModule.outputFiles[0].text).toString("base64")}`);
mkdirSync(join(out, "fonts"), { recursive: true });
const fontFiles = {};
const fontBodies = {};
const licences = [];
let fontBytes = 0;
for (const [id, font] of Object.entries(SELF_HOSTED_FONTS)) {
  const root = dirname(require.resolve(`@fontsource/${font.package}/package.json`));
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const weight of font.weights) {
    const body = readFileSync(join(root, "files", `${font.package}-latin-${weight}-normal.woff2`));
    const name = `font-${fontFileKey(id, weight)}.${createHash("sha256").update(body).digest("hex").slice(0, 10)}.woff2`;
    fontFiles[fontFileKey(id, weight)] = name;
    fontBodies[name] = body.toString("base64");
    fontBytes += body.byteLength;
  }
  licences.push(`${font.family} (@fontsource/${font.package} ${version})\n\n${readFileSync(join(root, "LICENSE"), "utf8").trim()}\n`);
}
writeFileSync(
  join(out, "fonts", "LICENSES.txt"),
  `The fonts genesis-sites serves, each under the SIL Open Font License 1.1.\n\n${licences.join(`\n${"-".repeat(72)}\n\n`)}`,
);

const assets = {
  css: { name: `sites.${hash(css)}.css`, type: "text/css; charset=utf-8", body: css },
  formsCss: { name: `sites-forms.${hash(formsCss)}.css`, type: "text/css; charset=utf-8", body: formsCss },
  islands: { name: `islands.${hash(islands)}.js`, type: "text/javascript; charset=utf-8", body: islands },
  formIsland: { name: formIslandName, type: "text/javascript; charset=utf-8", body: formIsland },
};
for (const a of Object.values(assets)) writeFileSync(join(out, a.name), a.body);
writeFileSync(join(out, "sites.css"), css);
writeFileSync(join(out, "sites-forms.css"), formsCss);

const sizes = { ...Object.fromEntries(Object.entries(assets).map(([k, a]) => [k, Buffer.byteLength(a.body)])), fonts: fontBytes };
writeFileSync(
  generated,
  `// Generated by scripts/build-assets.mjs. Don't edit; run \`pnpm --filter @marktiderman/genesis-sites assets\`.\n` +
    `/* eslint-disable */\n` +
    `export interface SiteAsset { name: string; type: string; body: string }\n` +
    `export const ASSET_SIZES = ${JSON.stringify(sizes)} as const;\n` +
    `export const ASSETS: { css: SiteAsset; formsCss: SiteAsset; islands: SiteAsset; formIsland: SiteAsset } = ${JSON.stringify(assets)};\n` +
    `/** Each self-hosted font file's name under the assets prefix, by its key (\`inter-700\`). */\n` +
    `export const FONT_FILES: Readonly<Record<string, string>> = ${JSON.stringify(fontFiles)};\n`,
);
writeFileSync(
  fontsGenerated,
  `// Generated by scripts/build-assets.mjs. Don't edit; run \`pnpm --filter @marktiderman/genesis-sites assets\`.\n` +
    `/* eslint-disable */\n` +
    `/** Each font file's bytes, base64, by its name. Imported only to answer a font request. */\n` +
    `export const FONT_BODIES: Readonly<Record<string, string>> = ${JSON.stringify(fontBodies)};\n`,
);
console.log(`genesis-sites assets: ${Object.entries(sizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(1)} KB`).join(", ")}`);
