/**
 * Responsive images from private storage: an `ImageUrlBuilder` whose URLs
 * are signed links to an item's declared derivatives, so `responsiveImage`
 * gives a private photo a `srcset` like any public one.
 *
 * It signs; it never decides access. Call it only with the items the
 * person may already see, after the app's own rules have said so.
 */
import type { ImageUrlBuilder } from "../image";
import { mediaScope } from "./scope";
import type { MediaSignOptions, MediaSigner } from "./signer";

/**
 * One derivative of an item, as ADR 0012 names them: finish × size
 * (`color/800`, `bw/2400`), a rendition (`web-1080`) or `poster`. `width`
 * is its width in pixels.
 */
export interface ImageDerivative {
  name: string;
  width: number;
}

/** An item: its collection and its id. */
export interface MediaItemRef {
  collection: string;
  id: string;
}

/** @stability Experimental */
export interface SignedImageUrlsOptions {
  /** Where the media handler is served, such as `https://media.example.com`. */
  base: string | URL;
  /**
   * The derivatives every item has, by width (one finish at a time:
   * `finishSizes("color", [800, 2400])`). For each width a `srcset` asks
   * for, the builder serves the smallest derivative at least that wide, or
   * the widest there is.
   */
  derivatives: readonly ImageDerivative[];
  /**
   * The images to sign, as `src` values (`mediaSrc(collection, id)`). Only
   * these are served: the builder answers null for any other `src`, which
   * leaves that image at its own URL (for a `mediaSrc`, a relative storage
   * key that loads nothing), so don't render an item you didn't give, or
   * give it a placeholder. Give only items the person may see, one page at
   * a time: at most `maxItems`.
   */
  items: readonly string[];
  /**
   * The most items one call signs (after removing duplicates). Default
   * `DEFAULT_MAX_SIGNED_ITEMS` (1,000); more throws a `RangeError`. Every
   * item costs one HMAC per derivative and its URLs stay in memory, so sign
   * the page being rendered, not the whole collection.
   */
  maxItems?: number | undefined;
  /**
   * The path of a derivative under `base`. Default
   * `<collection>/<id>/<derivative>` (so `photos/a1/color/800`), which
   * `parseSignedImagePath` reads back in the handler's `route`.
   */
  path?: ((item: MediaItemRef, derivative: string) => string) | undefined;
  /**
   * Signing options, over the default `{ align: "hour" }` with the signer's
   * TTL for `file` scopes, so every `srcset` URL stays the same, and caches,
   * for the clock hour (with a whole-hour TTL). `{ ttl: "3h" }` keeps the
   * alignment; pass `align: "none"` to drop it.
   */
  sign?: MediaSignOptions | undefined;
}

/** The most items `createSignedImageUrls` signs in one call by default. */
export const DEFAULT_MAX_SIGNED_ITEMS = 1000;

/** An `ImageUrlBuilder` for signed derivatives, carrying their widths and when the first link expires. */
export type SignedImageUrls = ImageUrlBuilder & {
  /**
   * The derivative widths, ascending. `responsiveImage` reads them from the
   * builder: it offers these widths only, whatever its `widths` option, so
   * each `w` in the `srcset` is the derivative's own.
   */
  readonly widths: readonly number[];
  /**
   * When the earliest link expires, in Unix seconds (undefined with no
   * items). HTML holding these links must not be cached past it: cap the
   * page's `cache-control` (and an ISR `revalidate`) below `expires - now`.
   */
  readonly expires: number | undefined;
};

const NAME_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
/**
 * A collection or an id: not empty, not `.` or `..` (the URL would lose a
 * step), and nothing the media handler refuses in a path segment: no slash,
 * backslash or NUL, and no percent-escape (`%2e`).
 */
const REF_PART = /^(?!\.{1,2}$)(?!.*%[0-9a-f]{2})[^/\\\0]+$/i;
/** Never a derivative: the original is served only as a download. */
const RESERVED_DERIVATIVE = "original";

/** `finish × size` derivatives: `finishSizes("bw", [800, 2400])` is `bw/800` 800 wide and `bw/2400` 2400 wide. */
export function finishSizes(finish: string, widths: readonly number[]): ImageDerivative[] {
  return widths.map((width) => ({ name: `${finish}/${width}`, width }));
}

/**
 * The `src` an app stores for a private item: `<collection>/<id>`. Neither
 * part may be empty, `.` or `..`, or hold a slash, a backslash, NUL or a
 * percent-escape (`%2e`): the media handler refuses those paths, so their
 * links would only ever be 403.
 */
export function mediaSrc(collection: string, id: string): string {
  if (!REF_PART.test(collection) || !REF_PART.test(id)) {
    throw new TypeError("mediaSrc: collection and id must be non-empty, not be . or .., and hold no slash, backslash, NUL or percent-escape (%2e).");
  }
  return `${collection}/${id}`;
}

function parseSrc(src: string): MediaItemRef | undefined {
  const parts = src.split("/");
  return parts.length === 2 && parts.every((p) => REF_PART.test(p)) ? { collection: parts[0]!, id: parts[1]! } : undefined;
}

/**
 * The item and derivative a default derivative path names
 * (`photos/a1/color/800`), or undefined. Use it in the handler's `route`,
 * and check the derivative is one you declared:
 *
 * ```ts
 * route: (path) => {
 *   const p = parseSignedImagePath(path);
 *   if (!p || !names.has(p.derivative)) return undefined;
 *   return { key: `media/${path}.jpg`, scope: mediaScope.file(p.collection, p.id, p.derivative) };
 * }
 * ```
 */
export function parseSignedImagePath(path: string): (MediaItemRef & { derivative: string }) | undefined {
  const parts = path.split("/");
  if (parts.length < 3) return undefined;
  const [collection, id, ...rest] = parts as [string, string, ...string[]];
  if (!REF_PART.test(collection) || !REF_PART.test(id) || !rest.every((s) => NAME_SEGMENT.test(s))) return undefined;
  return { collection, id, derivative: rest.join("/") };
}

/**
 * Signs every declared derivative of `items` and returns the
 * `ImageUrlBuilder` that serves them, for `responsiveImage`:
 *
 * ```ts
 * const imageUrl = await createSignedImageUrls(signer, {
 *   base: "https://media.example.com",
 *   derivatives: finishSizes("color", [800, 2400]),
 *   items: visible.map((p) => mediaSrc("photos", p.id)),
 * });
 * const img = responsiveImage({ src: mediaSrc("photos", p.id), alt, width, height },
 *   { imageUrl, sizes: "100vw" });
 * // Cache the HTML for less than imageUrl.expires - now.
 * ```
 *
 * Each URL is signed for its own derivative (`mediaScope.file(collection,
 * id, derivative)`), so one derivative's link never opens another, nor the
 * original. It signs; it never decides access: pass only the items the
 * person may see, one page at a time (at most `maxItems`, default 1,000).
 * Signing is async (WebCrypto), so the links are made here and the builder
 * only looks them up. `format` and `quality` are ignored: derivatives are
 * fixed files, and the builder carries their `widths` for `responsiveImage`.
 *
 * Server and edge only, like the signer.
 *
 * @stability Experimental
 */
export async function createSignedImageUrls(signer: MediaSigner, options: SignedImageUrlsOptions): Promise<SignedImageUrls> {
  const derivatives = [...options.derivatives].sort((a, b) => a.width - b.width);
  if (derivatives.length === 0) throw new TypeError("createSignedImageUrls: declare at least one derivative.");
  const names = new Set<string>();
  const seenWidths = new Map<number, string>();
  for (const d of derivatives) {
    if (!d.name.split("/").every((s) => NAME_SEGMENT.test(s))) {
      throw new TypeError(`createSignedImageUrls: derivative "${d.name}" must be lowercase letters, digits and "-", in segments split by "/".`);
    }
    if (!Number.isInteger(d.width) || d.width <= 0) throw new TypeError(`createSignedImageUrls: derivative "${d.name}" needs a whole, positive width.`);
    if (d.name === RESERVED_DERIVATIVE) throw new TypeError(`createSignedImageUrls: "${RESERVED_DERIVATIVE}" can't be a derivative: originals are served only as downloads.`);
    if (names.has(d.name)) throw new TypeError(`createSignedImageUrls: derivative "${d.name}" is declared twice.`);
    const twin = seenWidths.get(d.width);
    if (twin !== undefined) {
      throw new TypeError(`createSignedImageUrls: derivatives "${twin}" and "${d.name}" are both ${d.width} wide; declare one finish at a time, one derivative per width.`);
    }
    names.add(d.name);
    seenWidths.set(d.width, d.name);
  }
  const widths = derivatives.map((d) => d.width);
  const path = options.path ?? ((item: MediaItemRef, derivative: string) => `${item.collection}/${item.id}/${derivative}`);
  const signOptions: MediaSignOptions = { align: "hour", ...options.sign };
  const maxItems = options.maxItems ?? DEFAULT_MAX_SIGNED_ITEMS;
  if (!Number.isInteger(maxItems) || maxItems <= 0) throw new RangeError("createSignedImageUrls: maxItems must be a whole, positive number.");
  const items = [...new Set(options.items)];
  if (items.length > maxItems) {
    throw new RangeError(`createSignedImageUrls: ${items.length} items is more than maxItems (${maxItems}). Sign one page at a time: only the items being rendered.`);
  }
  const refs = items.map((src) => {
    const item = parseSrc(src);
    if (!item) throw new TypeError(`createSignedImageUrls: item "${src}" isn't a mediaSrc(collection, id).`);
    return [src, item] as const;
  });

  // src -> derivative name -> signed URL
  const signed = new Map<string, Map<string, string>>();
  let expires: number | undefined;
  await Promise.all(
    refs.map(async ([src, item]) => {
      const urls = new Map<string, string>();
      for (const d of derivatives) {
        const url = await signer.signMediaUrl(options.base, path(item, d.name), mediaScope.file(item.collection, item.id, d.name), signOptions);
        const e = Number(new URL(url).searchParams.get("e"));
        if (expires === undefined || e < expires) expires = e;
        urls.set(d.name, url);
      }
      signed.set(src, urls);
    }),
  );

  const pick = (width: number | undefined): ImageDerivative =>
    (width === undefined ? undefined : derivatives.find((d) => d.width >= width)) ?? derivatives[derivatives.length - 1]!;

  const builder: ImageUrlBuilder = (src, o) => signed.get(src)?.get(pick(o.width).name) ?? null;
  return Object.assign(builder, { widths, expires });
}
