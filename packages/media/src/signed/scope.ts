/**
 * What a signature covers. Each scope names one exact thing, and the four
 * kinds can't stand in for each other: the kind is part of the signed text,
 * and every part is percent-encoded, so `item("a/b", "c")` and
 * `item("a", "b/c")` are different scopes.
 */

/** A scope's kind. */
export type MediaScopeKind = "item" | "file" | "download" | "bundle";

declare const scopeBrand: unique symbol;

/**
 * One thing a link may open, as the text the signature covers
 * (`file:photos/a1/poster`). Make one with `mediaScope`; never by hand.
 *
 * @stability Experimental
 */
export type MediaScope = string & { readonly [scopeBrand]: true };

/** How many parts each kind has. */
const PARTS: Record<MediaScopeKind, number> = { item: 2, file: 3, download: 2, bundle: 1 };

function part(name: string, value: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(`mediaScope: ${name} must be a non-empty string.`);
  try {
    return encodeURIComponent(value);
  } catch {
    throw new TypeError(`mediaScope: ${name} isn't well-formed text (a lone surrogate).`);
  }
}

/** One encoded part: exactly what `encodeURIComponent` emits. */
const PART = "(?:[A-Za-z0-9\\-_.!~*'()]|%[0-9A-F]{2})+";
const SCOPE = new RegExp(`^(item|file|download|bundle):(${PART}(?:/${PART})*)$`);

/** A part decoded, or undefined when its percent-encoding isn't valid UTF-8. */
function decodePart(encoded: string): string | undefined {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

const make = (kind: MediaScopeKind, ...parts: string[]) => `${kind}:${parts.join("/")}` as MediaScope;

/**
 * The scopes a link can be signed for.
 *
 * - `item(collection, id)`: every interchangeable preview of one item (its
 *   thumbnail and display sizes). Never use it for anything you wouldn't hand
 *   out with the preview: the route decides which files an item link opens.
 * - `file(collection, id, variant)`: one file of an item (one video
 *   rendition, a poster). A link for one variant never opens another.
 * - `download(path, filename)`: one exact file, with the name it downloads
 *   as bound in, so the link can't be reused to serve another name.
 * - `bundle(manifestId)`: a ZIP of the files a stored manifest lists.
 *
 * @stability Experimental
 */
export const mediaScope = {
  item: (collection: string, id: string): MediaScope => make("item", part("collection", collection), part("id", id)),
  file: (collection: string, id: string, variant: string): MediaScope =>
    make("file", part("collection", collection), part("id", id), part("variant", variant)),
  download: (path: string, filename: string): MediaScope => make("download", part("path", path), part("filename", filename)),
  bundle: (manifestId: string): MediaScope => make("bundle", part("manifestId", manifestId)),
} as const;

/**
 * The kind of a scope made by `mediaScope`, or undefined for any other
 * string: a known kind, the right number of parts, each in the exact
 * character set `encodeURIComponent` emits and decoding to valid UTF-8.
 */
export function scopeKind(scope: string): MediaScopeKind | undefined {
  if (typeof scope !== "string") return undefined;
  const m = SCOPE.exec(scope);
  if (!m) return undefined;
  const kind = m[1] as MediaScopeKind;
  const parts = m[2]!.split("/");
  return parts.length === PARTS[kind] && parts.every((p) => decodePart(p) !== undefined) ? kind : undefined;
}

/** The filename a `download` scope binds in, or undefined for every other scope (or a malformed one). */
export function scopeFilename(scope: string): string | undefined {
  if (scopeKind(scope) !== "download") return undefined;
  return decodePart(scope.slice(scope.lastIndexOf("/") + 1));
}
