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
  return encodeURIComponent(value);
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

/** The kind of a scope made by `mediaScope`, or undefined for any other string. */
export function scopeKind(scope: string): MediaScopeKind | undefined {
  if (typeof scope !== "string") return undefined;
  const colon = scope.indexOf(":");
  const kind = scope.slice(0, colon);
  if (!Object.hasOwn(PARTS, kind) || !/^[a-z]+:[^:/]+(\/[^:/]+)*$/.test(scope)) return undefined;
  return scope.slice(colon + 1).split("/").length === PARTS[kind as MediaScopeKind] ? (kind as MediaScopeKind) : undefined;
}

/** The filename a `download` scope binds in, or undefined for every other scope. */
export function scopeFilename(scope: string): string | undefined {
  if (scopeKind(scope) !== "download") return undefined;
  const encoded = scope.slice(scope.lastIndexOf("/") + 1);
  return decodeURIComponent(encoded);
}
