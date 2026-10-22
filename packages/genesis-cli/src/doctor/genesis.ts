/**
 * Reads the rules' ground truth from the installed Genesis packages: the
 * component package's type declarations (what it exports, which exports are
 * components), the design system's theme stylesheets (which tokens exist) and
 * Tailwind's palette (which literal colors to flag). No component or token is
 * listed here, so the doctor follows whatever Genesis version the app has.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { DoctorConfigError } from "./config.js";
import type { DoctorConfig, GenesisFacts } from "./types.js";

export const DEFAULT_UI_PACKAGE = "@marktiderman/genesis-ui";
export const DESIGN_SYSTEM_PACKAGE = "@marktiderman/genesis-design-system";

/**
 * Raw tags checked when Genesis ships a same-named component. `form` is left
 * out on purpose: a shadcn-style `Form` is a react-hook-form provider that
 * still wraps a real `<form>`.
 */
const TAGS = ["button", "input", "textarea", "select", "label", "table", "dialog", "progress", "details", "summary"];
/** Tags whose Genesis replacement has a different name. Applied only when that component exists. */
const TAG_ALIASES: Record<string, string> = { hr: "Separator" };

/** Names that look like components but are types or helpers. */
const NON_COMPONENT_SUFFIX = /(Props|Variant|Variants|Type|Types|Config|Context|Options|Status)$/;

/** Tailwind's default palette names; merged with the app's installed `tailwindcss/colors` when present. */
const TAILWIND_PALETTE = [
  "black", "white", "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime",
  "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
  "taupe", "mauve", "mist", "olive",
];

/** The installed folder of `name`, looking in node_modules from `from` upward (works with hoisting and pnpm). */
export function findPackageDir(from: string, name: string): string | null {
  let dir = path.resolve(from);
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadGenesis(root: string, config: DoctorConfig): GenesisFacts {
  const uiPackage = config.uiPackage ?? DEFAULT_UI_PACKAGE;
  const uiDir = findPackageDir(root, uiPackage);
  if (!uiDir) throw new DoctorConfigError(`${uiPackage} is not installed here. Install it, or set doctor.uiPackage.`);
  const uiPkg = JSON.parse(readFileSync(path.join(uiDir, "package.json"), "utf8"));

  // ---- Exports, from every subpath's declarations ----
  const typeEntries = new Set<string>();
  const mainTypes = uiPkg.types ?? uiPkg.typings ?? exportTypes(uiPkg.exports?.["."] ?? uiPkg.exports);
  if (typeof mainTypes === "string") typeEntries.add(mainTypes);
  for (const target of Object.values(uiPkg.exports ?? {})) {
    const t = exportTypes(target);
    if (typeof t === "string" && !t.includes("*")) typeEntries.add(t);
  }
  const exportNames = new Set<string>();
  const reexportedPackages = new Set<string>();
  let readAny = false;
  for (const entry of typeEntries) {
    const file = path.join(uiDir, entry);
    if (!existsSync(file)) continue;
    readAny = true;
    const dts = readFileSync(file, "utf8");
    for (const name of parseExportNames(dts)) exportNames.add(name);
    for (const m of dts.matchAll(/export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s*from\s*["']([^"'.][^"']*)["']/g)) {
      reexportedPackages.add(packageName(m[1]));
    }
  }
  if (!readAny) {
    throw new DoctorConfigError(`${uiPackage} has no type declarations to read (is it built?). Looked for: ${[...typeEntries].join(", ") || "none"}`);
  }

  // ---- Which exports are types only, from every declaration file it ships ----
  const valueDecls = new Set<string>();
  const typeDecls = new Set<string>();
  const declRoot = typeof mainTypes === "string" ? path.dirname(path.join(uiDir, mainTypes)) : uiDir;
  // Names re-exported from other packages (e.g. genesis-core's types) are declared there.
  const declFiles = walkDts(declRoot);
  for (const pkg of reexportedPackages) {
    const dir = findPackageDir(uiDir, pkg);
    if (dir) walkDts(path.join(dir, "dist"), declFiles);
  }
  for (const file of declFiles) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\b(?:declare\s+)?(?:const|let|var|function|class|enum)\s+([A-Za-z_$][\w$]*)/g)) valueDecls.add(m[1]);
    for (const m of text.matchAll(/\b(?:interface|type)\s+([A-Za-z_$][\w$]*)/g)) typeDecls.add(m[1]);
  }
  const isTypeOnly = (n: string) => typeDecls.has(n) && !valueDecls.has(n);
  const values = new Set([...exportNames].filter((n) => !isTypeOnly(n)));
  const components = [...values]
    // PascalCase (H1 and P included), but not SCREAMING_CASE constants.
    .filter((n) => /^[A-Z][A-Za-z0-9]*$/.test(n) && !(n.length > 2 && n === n.toUpperCase()) && !NON_COMPONENT_SUFFIX.test(n))
    .sort();

  // ---- Tokens, from the theme stylesheets ----
  const tokens = new Set<string>();
  const themeFiles = resolveThemeFiles(root, config, uiDir);
  for (const file of themeFiles) for (const t of declaredTokens(readFileSync(file, "utf8"))) tokens.add(t);

  // ---- Raw tags ----
  const byLower = new Map(components.map((c) => [c.toLowerCase(), c]));
  const rawTags = new Map<string, string>();
  for (const tag of TAGS) if (byLower.has(tag)) rawTags.set(tag, byLower.get(tag)!);
  for (const [tag, comp] of Object.entries(TAG_ALIASES)) if (values.has(comp)) rawTags.set(tag, comp);
  for (const [tag, comp] of Object.entries(config.rawTags ?? {})) {
    if (comp === false) rawTags.delete(tag);
    else rawTags.set(tag, comp);
  }

  return {
    uiPackage,
    uiVersion: String(uiPkg.version ?? "unknown"),
    exports: exportNames,
    values,
    components,
    tokens,
    rawTags,
    palette: loadPalette(root),
  };
}

/** Names exported by a declaration file: `export { a, b as c }` blocks and `export declare …` statements. */
export function parseExportNames(dts: string): string[] {
  const names: string[] = [];
  for (const m of dts.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (name && name !== "default") names.push(name);
    }
  }
  for (const m of dts.matchAll(/export\s+(?:declare\s+)?(?:const|let|function|class|enum|interface|type)\s+([A-Za-z_$][\w$]*)/g)) {
    names.push(m[1]);
  }
  return names;
}

/** Custom properties a stylesheet declares (`--name:`). */
export function declaredTokens(css: string): string[] {
  return [...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]);
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return parts.slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

function exportTypes(target: unknown): string | undefined {
  if (!target || typeof target !== "object") return undefined;
  const t = target as Record<string, unknown>;
  if (typeof t.types === "string") return t.types;
  for (const key of ["import", "default", "require"]) {
    const nested = exportTypes(t[key]);
    if (nested) return nested;
  }
  return undefined;
}

function walkDts(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDts(p, out);
    else if (/\.d\.[cm]?ts$/.test(entry.name)) out.push(p);
  }
  return out;
}

function resolveThemeFiles(root: string, config: DoctorConfig, uiDir: string): string[] {
  if (config.themeCss) {
    const specs = typeof config.themeCss === "string" ? [config.themeCss] : config.themeCss;
    return specs.map((spec) => {
      const file = resolveSpec(root, spec);
      if (!file) throw new DoctorConfigError(`doctor.themeCss: cannot find ${spec}`);
      return file;
    });
  }
  const files: string[] = [];
  const ds = findPackageDir(root, DESIGN_SYSTEM_PACKAGE);
  const themes = ds && path.join(ds, "dist", "themes");
  if (themes && existsSync(themes)) {
    for (const name of readdirSync(themes).sort()) if (name.endsWith(".css")) files.push(path.join(themes, name));
  }
  if (files.length === 0) {
    throw new DoctorConfigError(
      `No Genesis theme stylesheet found (${DESIGN_SYSTEM_PACKAGE}/dist/themes/*.css). Install the design system, or set doctor.themeCss.`,
    );
  }
  const uiStyles = path.join(uiDir, "dist", "styles.css");
  if (existsSync(uiStyles)) files.push(uiStyles);
  return files;
}

/** An app-relative path, or `package/sub/path` resolved inside that installed package. */
function resolveSpec(root: string, spec: string): string | null {
  const local = path.resolve(root, spec);
  if (spec.startsWith(".") || path.isAbsolute(spec)) return existsSync(local) ? local : null;
  const parts = spec.split("/");
  const nameLength = spec.startsWith("@") ? 2 : 1;
  const dir = findPackageDir(root, parts.slice(0, nameLength).join("/"));
  if (dir) {
    const file = path.join(dir, ...parts.slice(nameLength));
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return existsSync(local) ? local : null;
}

function loadPalette(root: string): string[] {
  const names = new Set(TAILWIND_PALETTE);
  try {
    const req = createRequire(path.join(root, "package.json"));
    const colors = req("tailwindcss/colors");
    for (const key of Object.keys(colors?.default ?? colors ?? {})) {
      if (/^[a-z]+$/.test(key) && !["inherit", "current", "transparent"].includes(key)) names.add(key);
    }
  } catch {
    // No Tailwind installed (or it is ESM-only): the built-in list stands.
  }
  return [...names].sort();
}
