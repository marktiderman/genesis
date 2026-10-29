/**
 * Adding a block's entry to the app's feature registry (`features.ts`), as a
 * text edit that keeps the file's formatting. The edit is made only when the
 * file has exactly one `defineFeatures({ … })` call whose object can be found
 * unambiguously; otherwise the caller prints the snippet to paste.
 */
import type { BlockManifest } from "./manifest.js";

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function literal(value: unknown, indent: string): string {
  if (Array.isArray(value)) return `[${value.map((v) => literal(v, indent)).join(", ")}]`;
  if (value && typeof value === "object") {
    const inner = `${indent}  `;
    const lines = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${inner}${IDENT.test(k) ? k : JSON.stringify(k)}: ${literal(v, inner)},`);
    return `{\n${lines.join("\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** The registry entry for a block, as `"<id>": { … },` at two spaces. */
export function featureSnippet(manifest: BlockManifest, owner: string): string {
  const apps = manifest.platforms?.length ? manifest.platforms : ["web", "native"];
  const entry: Record<string, unknown> = {
    name: manifest.feature?.name ?? manifest.id,
    summary: manifest.feature?.summary ?? `The ${manifest.id} block from ${manifest.package}.`,
    // Just added: the app hasn't shipped it yet. Move it on when it has.
    status: "building",
    kind: manifest.feature?.kind ?? "block",
    ...(manifest.feature?.keywords?.length ? { keywords: manifest.feature.keywords } : {}),
    ...(manifest.requires.length ? { requires: manifest.requires } : {}),
    owner,
    apps,
    audience: manifest.feature?.audience ?? ["developer"],
  };
  return `  ${JSON.stringify(manifest.id)}: ${literal(entry, "  ")},\n`;
}

/**
 * Where the defineFeatures object closes, skipping strings and comments.
 * Null when there isn't exactly one call, or the object can't be matched.
 */
export function registryInsertionPoint(text: string): number | null {
  return scanRegistry(text)?.close ?? null;
}

/** The closing brace of the defineFeatures object, and the last code character before it (not a comment). */
function scanRegistry(text: string): { close: number; last: number } | null {
  const calls = [...text.matchAll(/defineFeatures(?:<[^>]*>)?\(\s*\{/g)];
  if (calls.length !== 1) return null;
  let i = calls[0]!.index! + calls[0]![0].length;
  let last = i - 1;
  let depth = 1;
  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) return null;
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) {
        if (text[j] === "\\") j++;
        // A template with an expression could hide braces; don't guess.
        else if (c === "`" && text[j] === "$" && text[j + 1] === "{") return null;
        j++;
      }
      if (j >= text.length) return null;
      last = j;
      i = j + 1;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { close: i, last };
    }
    if (!/\s/.test(c)) last = i;
    i++;
  }
  return null;
}

/** The registry with the entry added, or null when the edit isn't safe. */
export function addFeatureEntry(text: string, snippet: string): string | null {
  const scan = scanRegistry(text);
  if (!scan) return null;
  // After the last entry (and any comments after it), on its own line; a comma after that entry when it has none.
  let head = text.slice(0, scan.close);
  if (!/[,{]/.test(text[scan.last]!)) head = `${head.slice(0, scan.last + 1)},${head.slice(scan.last + 1)}`;
  return `${head.replace(/\s*$/, "")}\n${snippet}${text.slice(scan.close)}`;
}
