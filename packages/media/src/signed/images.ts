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
   * leaves that image at its own URL. Give only items the person may see.
   */
  items: readonly string[];
  /**
   * The path of a derivative under `base`. Default
   * `<collection>/<id>/<derivative>` (so `photos/a1/color/800`), which
   * `parseSignedImagePath` reads back in the handler's `route`.
   */
  path?: ((item: MediaItemRef, derivative: string) => string) | undefined;
  /**
   * Signing options. Default `{ align: "hour" }` with the signer's TTL for
   * `file` scopes, so every `srcset` URL stays the same, and caches, for the
   * clock hour (with a whole-hour TTL).
   */
  sign?: MediaSignOptions | undefined;
}

/** An `ImageUrlBuilder` for signed derivatives, with the widths to give `responsiveImage`. */
export type SignedImageUrls = ImageUrlBuilder & {
  /** The derivative widths, ascending: pass them as `responsiveImage`'s `widths`, so each `w` in the `srcset` is true. */
  readonly widths: readonly number[];
};

const NAME_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
/** A collection or an id: not empty, no slash, not `.` or `..` (the URL would lose a step). */
const REF_PART = /^(?!\.{1,2}$)[^/]+$/;

/** `finish × size` derivatives: `finishSizes("bw", [800, 2400])` is `bw/800` 800 wide and `bw/2400` 2400 wide. */
export function finishSizes(finish: string, widths: readonly number[]): ImageDerivative[] {
  return widths.map((width) => ({ name: `${finish}/${width}`, width }));
}

/** The `src` an app stores for a private item: `<collection>/<id>`. Neither part may hold a slash. */
export function mediaSrc(collection: string, id: string): string {
  if (!REF_PART.test(collection) || !REF_PART.test(id)) throw new TypeError("mediaSrc: collection and id must be non-empty, hold no slash, and not be . or ..");
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
 *   { imageUrl, widths: imageUrl.widths, sizes: "100vw" });
 * ```
 *
 * Each URL is signed for its own derivative (`mediaScope.file(collection,
 * id, derivative)`), so one derivative's link never opens another, nor the
 * original. It signs; it never decides access: pass only the items the
 * person may see. Signing is async (WebCrypto), so the links are made here
 * and the builder only looks them up. `format` and `quality` are ignored:
 * derivatives are fixed files.
 *
 * Server and edge only, like the signer.
 *
 * @stability Experimental
 */
export async function createSignedImageUrls(signer: MediaSigner, options: SignedImageUrlsOptions): Promise<SignedImageUrls> {
  const derivatives = [...options.derivatives].sort((a, b) => a.width - b.width);
  if (derivatives.length === 0) throw new TypeError("createSignedImageUrls: declare at least one derivative.");
  const names = new Set<string>();
  for (const d of derivatives) {
    if (!d.name.split("/").every((s) => NAME_SEGMENT.test(s))) {
      throw new TypeError(`createSignedImageUrls: derivative "${d.name}" must be lowercase letters, digits and "-", in segments split by "/".`);
    }
    if (!Number.isInteger(d.width) || d.width <= 0) throw new TypeError(`createSignedImageUrls: derivative "${d.name}" needs a whole, positive width.`);
    if (names.has(d.name)) throw new TypeError(`createSignedImageUrls: derivative "${d.name}" is declared twice.`);
    names.add(d.name);
  }
  const widths = [...new Set(derivatives.map((d) => d.width))];
  const path = options.path ?? ((item: MediaItemRef, derivative: string) => `${item.collection}/${item.id}/${derivative}`);
  const signOptions: MediaSignOptions = options.sign ?? { align: "hour" };

  // src -> derivative name -> signed URL
  const signed = new Map<string, Map<string, string>>();
  await Promise.all(
    [...new Set(options.items)].map(async (src) => {
      const item = parseSrc(src);
      if (!item) throw new TypeError(`createSignedImageUrls: item "${src}" isn't a mediaSrc(collection, id).`);
      const urls = new Map<string, string>();
      for (const d of derivatives) {
        urls.set(d.name, await signer.signMediaUrl(options.base, path(item, d.name), mediaScope.file(item.collection, item.id, d.name), signOptions));
      }
      signed.set(src, urls);
    }),
  );

  const pick = (width: number | undefined): ImageDerivative =>
    (width === undefined ? undefined : derivatives.find((d) => d.width >= width)) ?? derivatives[derivatives.length - 1]!;

  const builder: ImageUrlBuilder = (src, o) => signed.get(src)?.get(pick(o.width).name) ?? null;
  return Object.assign(builder, { widths });
}
