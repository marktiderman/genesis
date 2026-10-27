/**
 * Rules about how an app calls Genesis APIs that a type check can't see.
 *
 * - `resource-view-tree`: a `<ResourceView>` or `<ResourcePage>` with `tree` and a server or
 *   cursor `pagination`. A tree is built from every row on the client, so the screen throws when it
 *   renders; this says so in CI first. An error: the screen can't render.
 * - `studio-server-auth-import`: an import of a studio-server file the package doesn't export
 *   (`…/dist/switch`, `…/src/auth`), or a CommonJS `require` of the package's root, which has no
 *   `require` condition. Both fail at run time (`ERR_PACKAGE_PATH_NOT_EXPORTED`);
 *   `@marktiderman/genesis-studio-server/auth` has the token checks and the identity switch, for
 *   `import` and `require`. A warning: a bundler may resolve a deep path today and not tomorrow.
 */
import { lineAt } from "./scan.js";
import type { DoctorContext } from "./types.js";

const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);

/** The text of the JSX opening tag starting at `start` (the `<`), up to its closing `>`. */
function openingTag(code: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return code.slice(start, i + 1);
  }
  return code.slice(start);
}

/** The tag's own attributes (outside every `{…}`), so a `tree` inside an expression isn't one. */
function ownAttributes(tag: string): string {
  let depth = 0;
  let quote: string | null = null;
  let out = "";
  for (let i = 0; i < tag.length; i++) {
    const ch = tag[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      if (depth === 0) out += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      if (depth === 0) out += ch;
    } else if (ch === "{") {
      if (depth === 0) out += "{";
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) out += "}";
    } else if (depth === 0) out += ch;
  }
  return out;
}

export function checkTreeViews(ctx: DoctorContext): void {
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext) || !/\btree\s*=/.test(file.code)) continue;
    // The name, then a type argument if any (`<ResourcePage<League>`), whose `>` doesn't end the tag.
    for (const m of file.code.matchAll(/<(ResourceView|ResourcePage)\b(?:\s*<[^<>]*>)?/g)) {
      const tag = openingTag(file.code, (m.index ?? 0) + m[0].length - 1);
      const attrs = ownAttributes(tag);
      if (!/\stree\s*=/.test(attrs) || !/\spagination\s*=/.test(attrs)) continue;
      // Its value: a string, bare or in braces (`pagination={"server"}`).
      const paging = tag.match(/\spagination\s*=\s*(?:\{\s*)?["'](server|cursor)["']/);
      if (!paging) continue;
      ctx.report({
        rule: "resource-view-tree",
        level: "error",
        file: file.path,
        line: lineAt(file.code, m.index ?? 0),
        subject: m[1],
        message: `${m[1]} has \`tree\` with pagination="${paging[1]}", which throws when it renders: a tree is built from every row on the client. Leave pagination unset (docs/RESOURCE-VIEW.md, "Tree mode")`,
      });
    }
  }
}

const STUDIO_SERVER = "@marktiderman/genesis-studio-server";
/** An import, export-from, dynamic import or require of a studio-server file it doesn't export. */
const DEEP = /\b(?:from|import|require)\s*\(?\s*["']@marktiderman\/genesis-studio-server\/(dist|src|lib)\/[^"']*["']/g;
/** A CommonJS require of the package root, which only has an `import` condition. */
const ROOT_REQUIRE = /\brequire\s*\(\s*["']@marktiderman\/genesis-studio-server["']\s*\)/g;

export function checkStudioServerImports(ctx: DoctorContext): void {
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext) || !file.code.includes(STUDIO_SERVER)) continue;
    for (const m of file.code.matchAll(DEEP)) {
      ctx.report({
        rule: "studio-server-auth-import",
        level: "warn",
        file: file.path,
        line: lineAt(file.code, m.index ?? 0),
        subject: `${STUDIO_SERVER}/${m[1]}`,
        message: `imports a studio-server file the package doesn't export, which fails at run time; the token checks and switchToUser are in ${STUDIO_SERVER}/auth (import or require)`,
      });
    }
    for (const m of file.code.matchAll(ROOT_REQUIRE)) {
      ctx.report({
        rule: "studio-server-auth-import",
        level: "warn",
        file: file.path,
        line: lineAt(file.code, m.index ?? 0),
        subject: STUDIO_SERVER,
        message: `requires ${STUDIO_SERVER}, which is ESM-only and fails under require(); ${STUDIO_SERVER}/auth (the token checks and switchToUser) ships for require too`,
      });
    }
  }
}
