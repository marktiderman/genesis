/**
 * Rules for an app's client layer (ADR 0020). Both warn, and only once the app has a layer: a
 * folder (`src/client`, or genesis.config.json's `client.dir`) holding its `resource-view.tsx`.
 *
 * - `client/layer`: a screen renders Genesis's `<ResourceView>` or `<RecordView>` directly. With a
 *   layer, screens render the app's wrapper from it, so a default the app sets reaches every list
 *   and record page at once. The layer's own files may render Genesis's.
 * - `client/one-view-per-resource`: two `defineView` calls over the same contract. One view per
 *   resource holds its rules; a screen narrows it with props (`preset`, `filter`, `columns`), and
 *   a second definition drifts from the first.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { readGenesisConfig } from "./config.js";
import { lineAt } from "./scan.js";
import type { DoctorContext } from "./types.js";

const JSX_EXTS = new Set([".tsx", ".jsx"]);
const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts"]);
export const DEFAULT_CLIENT_DIR = "src/client";

/** The app's client-layer folder, and whether the layer exists. */
export function clientLayer(root: string, files: DoctorContext["files"]): { dir: string; present: boolean } {
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
  return { dir, present };
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
        const at = file.code.search(new RegExp(`<${local}\\b`));
        if (at < 0) continue;
        ctx.report({
          rule: "client/layer",
          level: "warn",
          file: file.path,
          line: lineAt(file.code, at),
          subject: name,
          message: `renders Genesis's <${name}> directly; the app has a client layer (${layer.dir}), so render its ${name === "ResourceView" ? "ResourceView" : "record page"} from there, and its defaults reach this screen too (docs/adr/0020-client-layer.md)`,
        });
      }
    }
  }

  // ── client/one-view-per-resource ─────────────────────────────────
  const seen = new Map<string, { file: string; line: number }>();
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext)) continue;
    for (const m of file.code.matchAll(/\bdefineView\s*(?:<[^>]*>)?\s*\(\s*([^,)]+?)\s*[,)]/g)) {
      const contract = m[1]!.replace(/\s+/g, "");
      // A contract written inline (an object literal) has no name to compare.
      if (!contract || contract.startsWith("{")) continue;
      const line = lineAt(file.code, m.index ?? 0);
      const first = seen.get(contract);
      if (!first) {
        seen.set(contract, { file: file.path, line });
        continue;
      }
      ctx.report({
        rule: "client/one-view-per-resource",
        level: "warn",
        file: file.path,
        line,
        subject: contract,
        message: `defines a second view over ${contract} (the first is in ${first.file}:${first.line}); keep one view per resource and narrow it on the screen (preset, filter, columns), so its rules can't drift (docs/adr/0020-client-layer.md)`,
      });
    }
  }
}
