/**
 * Rules for an app's client layer (ADR 0020). Both warn, and only once the app has a layer: a
 * folder (`src/client`, or genesis.config.json's `client.dir`) holding its `resource-view.tsx`.
 *
 * - `client/layer`: a screen renders Genesis's `<ResourceView>` or `<RecordView>` directly. With a
 *   layer, screens render the app's wrappers from it (`resource-view.tsx`, `record-view.tsx`), so a
 *   default the app sets reaches every list and record page at once. The layer's own files may
 *   render Genesis's. `<RecordView>` is reported only once the layer has `record-view.tsx`.
 * - `client/one-view-per-resource`: two `defineView` calls over the same contract. One view per
 *   resource holds its rules; a screen narrows it with props (`preset`, `filter`, `columns`), and
 *   a second definition drifts from the first. A contract is told apart by where it comes from:
 *   an import resolves to its module and name (`contracts["public.tasks"]` by the key too), and a
 *   name declared in the file is that file's. Stories and tests are left out: they define views
 *   to show or try one.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { readGenesisConfig } from "./config.js";
import { lineAt } from "./scan.js";
import { escapeRegExp } from "../regexp.js";
import type { DoctorContext } from "./types.js";

const JSX_EXTS = new Set([".tsx", ".jsx"]);
const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts"]);
export const DEFAULT_CLIENT_DIR = "src/client";

/** The app's client-layer folder, whether the layer exists, and whether it has a record-page wrapper. */
export function clientLayer(root: string, files: DoctorContext["files"]): { dir: string; present: boolean; recordWrapper: boolean } {
  let dir = DEFAULT_CLIENT_DIR;
  try {
    dir = readGenesisConfig(root)?.client?.dir ?? DEFAULT_CLIENT_DIR;
  } catch {
    // A config the doctor can't read is reported elsewhere; the default folder still counts.
  }
  const inside = `${dir}/`;
  const present =
    files.some((f) => f.path.startsWith(inside) && /(^|\/)resource-view\.(t|j)sx?$/.test(f.path)) ||
    existsSync(path.join(root, dir, "resource-view.tsx"));
  const recordWrapper =
    files.some((f) => f.path.startsWith(inside) && /(^|\/)record-view\.(t|j)sx?$/.test(f.path)) ||
    existsSync(path.join(root, dir, "record-view.tsx"));
  return { dir, present, recordWrapper };
}

/** The Genesis component a file imports under its own name, from the ui package (or its /data). */
function genesisImports(code: string, uiPackage: string): Map<string, string> {
  const out = new Map<string, string>();
  const escaped = uiPackage.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const re = new RegExp(`import\\s*(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*["']${escaped}(?:/data)?["']`, "g");
  for (const m of code.matchAll(re)) {
    if (/^\s*type\s/.test(m[0].slice(6))) continue;
    for (const part of m[1]!.split(",")) {
      const spec = part.trim().replace(/^type\s+/, "");
      if (!spec || part.trim().startsWith("type ")) continue;
      const [imported, local] = spec.split(/\s+as\s+/).map((x) => x.trim());
      if (imported === "ResourceView" || imported === "RecordView") out.set(local ?? imported!, imported!);
    }
  }
  return out;
}

export function checkClientLayer(ctx: DoctorContext): void {
  const layer = clientLayer(ctx.root, ctx.files);
  const inside = `${layer.dir}/`;

  // ── client/layer ─────────────────────────────────────────────────
  if (layer.present) {
    for (const file of ctx.files) {
      if (!JSX_EXTS.has(file.ext) || file.path.startsWith(inside)) continue;
      const imported = genesisImports(file.code, ctx.genesis.uiPackage);
      for (const [local, name] of imported) {
        if (name === "RecordView" && !layer.recordWrapper) continue;
        const at = file.code.search(new RegExp(`<${local}\\b`));
        if (at < 0) continue;
        ctx.report({
          rule: "client/layer",
          level: "warn",
          file: file.path,
          line: lineAt(file.code, at),
          subject: name,
          message: `renders Genesis's <${name}> directly; the app has a client layer (${layer.dir}), so render its ${name === "ResourceView" ? "ResourceView from resource-view.tsx" : "RecordView from record-view.tsx"}, and its defaults reach this screen too (docs/adr/0020-client-layer.md)`,
        });
      }
    }
  }

  // ── client/one-view-per-resource ─────────────────────────────────
  if (!layer.present) return;
  const seen = new Map<string, { file: string; line: number }>();
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext) || SHOWN_OR_TRIED.test(file.path)) continue;
    const imports = importedNames(file.path, file.code);
    for (const m of file.code.matchAll(/\bdefineView\s*(?:<[^>]*>)?\s*\(\s*([A-Za-z_$][\w$]*)((?:\s*(?:\.\s*[A-Za-z_$][\w$]*|\[\s*["'`][^"'`]+["'`]\s*\]))*)\s*[,)]/g)) {
      const base = m[1]!;
      const access = m[2]!.replace(/\s+/g, "").replace(/'|`/g, '"');
      // The contract's identity: the module it is imported from and its name there, else this
      // file's own top-level binding. A name bound anywhere else (a function's parameter, a local)
      // can't be told apart from another of the same name by reading the text, so it isn't counted.
      const imported = imports.get(base);
      if (!imported && !declaredAtTop(file.code, base)) continue;
      const identity = `${imported ?? `${file.path}#${base}`}${access}`;
      const shown = `${base}${access}`;
      const line = lineAt(file.code, m.index ?? 0);
      const first = seen.get(identity);
      if (!first) {
        seen.set(identity, { file: file.path, line });
        continue;
      }
      ctx.report({
        rule: "client/one-view-per-resource",
        level: "warn",
        file: file.path,
        line,
        subject: shown,
        message: `defines a second view over ${shown} (the first is in ${first.file}:${first.line}); keep one view per resource and narrow it on the screen (preset, filter, columns), so its rules can't drift (docs/adr/0020-client-layer.md)`,
      });
    }
  }
}

/** Whether a file binds `name` at its top level (`const`, `let`, `var`, unindented, exported or not). */
function declaredAtTop(code: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  return new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\b`, "m").test(code);
}

/** Stories and tests define views to show or try one. */
const SHOWN_OR_TRIED = /(\.stories\.|\.test\.|\.spec\.|(^|\/)__tests__\/)/;

/** Each name a file imports, as `<module>#<name>`: a relative module resolved from the file, without its extension. */
function importedNames(filePath: string, code: string): Map<string, string> {
  const out = new Map<string, string>();
  const dir = path.posix.dirname(filePath);
  const where = (spec: string) => (spec.startsWith(".") ? path.posix.normalize(path.posix.join(dir, spec)).replace(/\.(t|j)sx?$/, "").replace(/\/index$/, "") : spec);
  for (const m of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    for (const part of m[1]!.split(",")) {
      const spec = part.trim().replace(/^type\s+/, "");
      if (!spec) continue;
      const [imported, local] = spec.split(/\s+as\s+/).map((x) => x.trim());
      out.set(local ?? imported!, `${where(m[2]!)}#${imported}`);
    }
  }
  for (const m of code.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from\s*["']([^"']+)["']/g)) out.set(m[1]!, `${where(m[2]!)}#*`);
  return out;
}
