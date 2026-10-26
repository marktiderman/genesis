/**
 * The built-in, app-agnostic checks. Each is driven by facts read from the
 * installed Genesis packages, never by a hardcoded component or token list.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { findColorFunctions, findHexLiterals } from "../../../../scripts/lib/color-literals.mjs";
import { globMatcher } from "./glob.js";
import { declaredTokens } from "./genesis.js";
import type { DoctorContext, SourceFile } from "./types.js";

/** Ids of the built-in rules, for `rules` overrides and `allow` entries. */
export const BUILTIN_RULES = [
  "local-primitives",
  "starter-leftover",
  "forbidden-import",
  "raw-tag",
  "palette-color",
  "arbitrary-color",
  "raw-color",
  "undefined-token",
  "shadowed-export",
  "version-skew",
  "duplicate-genesis-package",
  "peer-range-mismatch",
  // structure
  "hand-rolled-sub-nav",
  "local-genesis-copy",
  "resource-workspace",
  "page-layout",
  // dates
  "iso-date-slice",
  // native pack
  "native-raw-primitive",
  "native-literal-color",
  "native-custom-header",
  "native-screen-layout",
  "store-readiness",
  // supabase pack
  "migration-grants",
  "migration-rls",
  "migration-definer-search-path",
  "migration-edited",
  "migration-testing-kit",
] as const;

export const DEFAULT_LOCAL_PRIMITIVE_DIRS = ["src/components/ui"];
const STARTER_LEFTOVERS = ["components.json", "src/lib/utils.ts"];
const DEFAULT_IGNORE_TOKEN_PREFIXES = ["--tw-", "--radix-"];

const JSX_EXTS = new Set([".tsx", ".jsx"]);
const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);

/** Every module specifier a file imports or re-exports, with its 1-based line. */
export function importSpecifiers(file: SourceFile): Array<{ specifier: string; line: number }> {
  const out: Array<{ specifier: string; line: number }> = [];
  const lines = file.code.split("\n");
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|@import\s+)["']([^"']+)["']/g;
  lines.forEach((text, i) => {
    for (const m of text.matchAll(re)) out.push({ specifier: m[1], line: i + 1 });
  });
  return out;
}

export function checkProjectLayout(ctx: DoctorContext): void {
  for (const dir of ctx.config.localPrimitiveDirs ?? DEFAULT_LOCAL_PRIMITIVE_DIRS) {
    if (existsSync(path.join(ctx.root, dir))) {
      ctx.report({
        rule: "local-primitives",
        file: dir,
        subject: dir,
        message: `is a local design-system primitive folder; use ${ctx.genesis.uiPackage} (or extend it upstream)`,
      });
    }
  }
  for (const file of STARTER_LEFTOVERS) {
    if (existsSync(path.join(ctx.root, file))) {
      ctx.report({
        rule: "starter-leftover",
        level: "warn",
        file,
        subject: file,
        message: `is a starter leftover; Genesis ships cn and owns the components`,
      });
    }
  }
}

export function checkImports(ctx: DoctorContext): void {
  const ui = ctx.genesis.uiPackage;
  const forbidden: Array<[RegExp, string]> = [
    [/^@radix-ui\//, `imports Radix directly; use the Genesis wrapper from ${ui}`],
    [/^(?:[@~#]\/|\.{1,2}\/)(?:.*\/)?components\/ui(?:\/|$)/, `imports a local UI primitive; use ${ui}`],
    [/^[@~#]\/lib\/utils$/, `imports the starter's utils; use cn from ${ui}`],
    ...Object.entries(ctx.config.forbiddenImports ?? {}).map(([re, msg]) => [new RegExp(re), msg] as [RegExp, string]),
  ];
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    for (const { specifier, line } of importSpecifiers(file)) {
      const hit = forbidden.find(([re]) => re.test(specifier));
      if (hit) ctx.report({ rule: "forbidden-import", file: file.path, line, subject: specifier, message: `${hit[1]} ('${specifier}')` });
    }
  }
}

export function checkRawTags(ctx: DoctorContext): void {
  const tags = [...ctx.genesis.rawTags].map(([tag, component]) => [tag, component, new RegExp(`<${tag}(?=[\\s>/]|$)`)] as const);
  if (tags.length === 0) return;
  for (const file of ctx.files) {
    if (!JSX_EXTS.has(file.ext)) continue;
    file.code.split("\n").forEach((text, i) => {
      for (const [tag, component, re] of tags) {
        if (re.test(text)) {
          ctx.report({ rule: "raw-tag", file: file.path, line: i + 1, subject: tag, message: `renders a raw <${tag}>; use Genesis ${component}` });
        }
      }
    });
  }
}

/** Tailwind utilities that take a color. */
const COLOR_UTILITIES = "bg|text|border(?:-[xytrbls])?|ring|ring-offset|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret|placeholder";
const ARBITRARY_COLOR_RE = /(?<![\w-])[a-z][a-z-]*-\[(?:#|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\()[^\]]*\]/g;

export function checkColors(ctx: DoctorContext): void {
  const palette = new RegExp(
    `(?<![\\w-])(?:${COLOR_UTILITIES})-(?:${ctx.genesis.palette.join("|")})(?:-\\d{2,3})?(?:\\/\\d{1,3})?(?![\\w-])`,
    "g",
  );
  // With the native pack, literals in code are style values: report them as native-literal-color with the native fix.
  const native = ctx.config.packs?.includes("native") ?? false;
  const themeRoles = ctx.genesis.values.has("useThemeRoles") ? "a theme role (useThemeRoles())" : "a theme role";
  for (const file of ctx.files) {
    const nativeCode = native && SCRIPT_EXTS.has(file.ext);
    file.code.split("\n").forEach((text, i) => {
      const line = i + 1;
      for (const m of text.matchAll(palette)) {
        ctx.report({ rule: "palette-color", file: file.path, line, subject: m[0], message: `uses the literal palette color '${m[0]}'; use a semantic token (bg-primary, text-muted-foreground, …)` });
      }
      // Arbitrary values are reported once, as arbitrary-color, not again as raw-color.
      const arbitrary: Array<[number, number]> = [];
      for (const m of text.matchAll(ARBITRARY_COLOR_RE)) {
        arbitrary.push([m.index!, m.index! + m[0].length]);
        ctx.report({ rule: "arbitrary-color", file: file.path, line, subject: m[0], message: `uses the arbitrary color '${m[0]}'; define it as a brand token first` });
      }
      for (const hit of [...findHexLiterals(text), ...findColorFunctions(text)]) {
        const at = hit.column - 1;
        if (arbitrary.some(([a, b]) => at >= a && at < b)) continue;
        if (nativeCode) {
          ctx.report({
            rule: "native-literal-color",
            file: file.path,
            line,
            subject: hit.literal,
            message: `hardcodes the color ${hit.literal}; use ${themeRoles}, a token className (bg-primary, text-muted-foreground) or PlatformColor(...)`,
          });
          continue;
        }
        ctx.report({ rule: "raw-color", file: file.path, line, subject: hit.literal, message: `hardcodes the color ${hit.literal}; color values come from Genesis tokens` });
      }
    });
  }
}

export function checkTokens(ctx: DoctorContext): void {
  const defined = new Set(ctx.genesis.tokens);
  const isTokenFile = ctx.config.tokenFiles ? globMatcher(ctx.config.tokenFiles) : (p: string) => p.endsWith(".css");
  for (const file of ctx.files) {
    if (isTokenFile(file.path)) for (const t of declaredTokens(file.code)) defined.add(t);
    // A custom property set inline (style={{ "--progress": "40%" }}) is a runtime variable, not a token.
    for (const m of file.code.matchAll(/["'](--[A-Za-z0-9_-]+)["']\s*:/g)) defined.add(m[1]);
  }
  // Token files outside the scanned folders (e.g. a brand package).
  for (const pattern of ctx.config.tokenFiles ?? []) {
    if (/[*?]/.test(pattern)) continue;
    const abs = path.join(ctx.root, pattern);
    if (!ctx.files.some((f) => f.absolutePath === abs) && existsSync(abs)) {
      for (const t of declaredTokens(readFileSync(abs, "utf8"))) defined.add(t);
    }
  }
  const ignorePrefixes = ctx.config.ignoreTokenPrefixes ?? DEFAULT_IGNORE_TOKEN_PREFIXES;
  for (const file of ctx.files) {
    file.code.split("\n").forEach((text, i) => {
      for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
        const token = m[1];
        if (defined.has(token) || ignorePrefixes.some((p) => token.startsWith(p))) continue;
        ctx.report({ rule: "undefined-token", file: file.path, line: i + 1, subject: token, message: `references the undefined token ${token}; define it in Genesis or the brand` });
      }
    });
  }
}

export function checkShadowedExports(ctx: DoctorContext): void {
  const re = /\bexport\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Z][\w$]*)/g;
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    file.code.split("\n").forEach((text, i) => {
      for (const m of text.matchAll(re)) {
        if (!ctx.genesis.values.has(m[1])) continue;
        ctx.report({ rule: "shadowed-export", file: file.path, line: i + 1, subject: m[1], message: `shadows the Genesis export '${m[1]}'; reuse or extend Genesis ${m[1]}` });
      }
    });
  }
}

/** Genesis components that no scanned file imports (named imports or re-exports from the package or its subpaths). */
export function unusedComponents(ctx: Pick<DoctorContext, "files" | "genesis">): string[] {
  const used = new Set<string>();
  const pkg = ctx.genesis.uiPackage.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const re = new RegExp(`\\b(?:import|export)\\s+(?:type\\s+)?(?:[\\w$]+\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s*["']${pkg}(?:/[^"']*)?["']`, "g");
  for (const file of ctx.files) {
    for (const m of file.code.matchAll(re)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]?.trim();
        if (name) used.add(name);
      }
    }
  }
  return ctx.genesis.components.filter((c) => !used.has(c));
}

