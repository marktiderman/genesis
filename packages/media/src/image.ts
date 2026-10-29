/**
 * One image, and the attributes that load it at the right size.
 *
 * `ImageValue` is what an app stores. `responsiveImage(value, options)`
 * turns it into an `<img>`'s attributes: a `srcset` of widths through the
 * host's `ImageUrlBuilder` (a Supabase Storage transform, an image CDN, or
 * pass-through), `sizes`, the intrinsic size that stops layout shift, and
 * `loading`, `fetchpriority` and `decoding` by whether the image is the
 * page's first large one.
 */

/** Where the subject is, 0 to 100 from the left and from the top. Crops keep it in frame. */
export interface FocalPoint {
  x: number;
  y: number;
}

/**
 * A second image for narrow screens (art direction): the same subject cropped
 * for a phone, typically taller. It replaces the main image under
 * `PHONE_MEDIA`.
 */
export interface PhoneCrop {
  src: string;
  width?: number | undefined;
  height?: number | undefined;
  focal?: FocalPoint | undefined;
}

/** An image as an app stores it. */
export interface ImageValue {
  src: string;
  /** What it shows, for someone who can't see it. Empty when `decorative`. */
  alt?: string | undefined;
  /** It adds nothing to the content (a texture, a backdrop): empty alt. */
  decorative?: boolean | undefined;
  /** The file's intrinsic size, in pixels. */
  width?: number | undefined;
  height?: number | undefined;
  focal?: FocalPoint | undefined;
  phone?: PhoneCrop | undefined;
  /** A tiny blurred preview, as a `data:image/...;base64,` URI, shown while the image loads. */
  placeholder?: string | undefined;
}

/** `auto` lets the image service pick (WebP or AVIF by the browser's Accept); `origin` keeps the file's own format. */
export type ImageFormat = "auto" | "origin" | "webp" | "avif";

export interface ImageUrlOptions {
  /** The width to serve, in pixels. */
  width?: number;
  format?: ImageFormat;
  /** 1 to 100. */
  quality?: number;
}

/**
 * The host's image URL builder: the URL that serves `src` at `options`, or
 * null when this builder can't transform `src` (another host's image), which
 * leaves the image at its own URL with no `srcset`.
 */
export type ImageUrlBuilder = (src: string, options: ImageUrlOptions) => string | null;

/** Serves every image at its own URL, with no `srcset`. The default. */
export const passThroughImageUrl: ImageUrlBuilder = () => null;

export interface SupabaseImageUrlOptions {
  /** The project's URL, such as `https://abc.supabase.co` (or a local `http://127.0.0.1:54321`). */
  url: string;
  /** Default quality, 20 to 100 (Supabase's own default is 80). */
  quality?: number;
}

/** Supabase's transform limits: 1 to 2500 pixels a side. */
const SUPABASE_MAX_WIDTH = 2500;

/**
 * Supabase Storage image transformations for public buckets: an image at
 * `<url>/storage/v1/object/public/<bucket>/<path>` is served from
 * `<url>/storage/v1/render/image/public/<bucket>/<path>?width=&quality=`.
 * Supabase picks WebP for browsers that take it on its own (it doesn't offer
 * AVIF yet), so `auto`, `webp` and `avif` all leave the format to it, and
 * `origin` sends `format=origin`. Anything outside this project's public
 * storage, or with a query of its own, is left alone (null).
 *
 * @stability Beta
 */
export function supabaseImageUrl(options: SupabaseImageUrlOptions): ImageUrlBuilder {
  let origin: string;
  try {
    origin = new URL(options.url).origin;
  } catch {
    throw new Error(`supabaseImageUrl: ${options.url} isn't a URL.`);
  }
  const objectPrefix = "/storage/v1/object/public/";
  return (src, o) => {
    let u: URL;
    try {
      u = new URL(src);
    } catch {
      return null;
    }
    if (u.origin !== origin || !u.pathname.startsWith(objectPrefix) || u.search || u.hash) return null;
    const params = new URLSearchParams();
    if (o.width) params.set("width", String(Math.min(SUPABASE_MAX_WIDTH, Math.max(1, Math.round(o.width)))));
    const quality = o.quality ?? options.quality;
    if (quality) params.set("quality", String(Math.min(100, Math.max(20, Math.round(quality)))));
    if (o.format === "origin") params.set("format", "origin");
    const query = params.toString();
    return `${origin}/storage/v1/render/image/public/${u.pathname.slice(objectPrefix.length)}${query ? `?${query}` : ""}`;
  };
}

/** The widths a `srcset` offers by default: phone to large desktop, high-density screens included. */
export const DEFAULT_WIDTHS: readonly number[] = [320, 480, 640, 768, 960, 1280, 1600, 1920, 2400];

/** The fallback `src` when a `srcset` is offered: the largest offered width up to this. */
const FALLBACK_WIDTH = 1280;

/** The media query under which a `phone` crop replaces the image. */
export const PHONE_MEDIA = "(max-width: 639px)";

export interface ResponsiveImageOptions {
  /** The image URL builder (default pass-through). */
  imageUrl?: ImageUrlBuilder;
  /** How wide the image shows, for the browser's pick (`(min-width: 768px) 50vw, 100vw`). */
  sizes?: string;
  /** The widths to offer (default `DEFAULT_WIDTHS`), never past the image's own width. */
  widths?: readonly number[];
  /** The page's first large image: loaded at once, at high priority. */
  priority?: boolean;
  /** Loaded at once at normal priority (a logo in the header). `priority` wins. */
  eager?: boolean;
  format?: ImageFormat;
  quality?: number;
}

export interface ResponsiveSource {
  src: string;
  srcset?: string;
  width?: number;
  height?: number;
}

export interface ResponsiveImage extends ResponsiveSource {
  /** Only with a `srcset` (it means nothing without one). */
  sizes?: string;
  alt: string;
  loading: "eager" | "lazy";
  fetchpriority?: "high";
  decoding: "sync" | "async";
  /** `object-position` from the focal point, as `x% y%`. */
  objectPosition?: string;
  /** The phone crop, for a `<source media={phone.media}>` in a `<picture>`. */
  phone?: ResponsiveSource & { media: string; sizes?: string; objectPosition?: string };
  /** The placeholder, when it is a safe one (`isSafePlaceholder`). */
  placeholder?: string;
}

/** The longest placeholder accepted: a blur preview is a few hundred bytes. */
export const MAX_PLACEHOLDER = 4096;
const PLACEHOLDER = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/** A placeholder that is safe to put in a style: a small base64 PNG, JPEG, WebP or GIF, nothing else. */
export function isSafePlaceholder(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_PLACEHOLDER && PLACEHOLDER.test(value);
}

/** `object-position` for a focal point, clamped to 0 to 100. */
export function focalPosition(focal: FocalPoint | undefined): string | undefined {
  if (!focal) return undefined;
  const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 50));
  return `${clamp(focal.x)}% ${clamp(focal.y)}%`;
}

/** The widths to offer for a file `width` wide: none past it, and the file's own width when a larger one was dropped. */
export function srcsetWidths(width: number | undefined, widths: readonly number[] = DEFAULT_WIDTHS): number[] {
  const all = [...new Set(widths.filter((w) => Number.isInteger(w) && w > 0))].sort((a, b) => a - b);
  if (!width) return all;
  const kept = all.filter((w) => w <= width);
  if (all.some((w) => w > width) && !kept.includes(width)) kept.push(width);
  return kept;
}

function source(src: string, width: number | undefined, height: number | undefined, o: ResponsiveImageOptions): ResponsiveSource {
  const build = o.imageUrl ?? passThroughImageUrl;
  const out: ResponsiveSource = { src };
  if (width) out.width = width;
  if (height) out.height = height;
  const fmt = { ...(o.format ? { format: o.format } : {}), ...(o.quality ? { quality: o.quality } : {}) };
  const widths = srcsetWidths(width, o.widths);
  const entries: string[] = [];
  for (const w of widths) {
    const url = build(src, { width: w, ...fmt });
    // The builder can't serve this image: its own URL, no srcset.
    if (!url) return out;
    entries.push(`${url} ${w}w`);
  }
  if (!entries.length) return out;
  const fallbackWidth = widths.filter((w) => w <= FALLBACK_WIDTH).pop() ?? widths[0]!;
  out.src = build(src, { width: fallbackWidth, ...fmt }) ?? src;
  out.srcset = entries.join(", ");
  return out;
}

/**
 * An image's attributes, sized for the layout it shows in. `value.src` and
 * `value.phone.src` are used as given: check them (and put a site path under
 * its base path) before calling.
 *
 * @stability Beta
 */
export function responsiveImage(value: ImageValue, options: ResponsiveImageOptions = {}): ResponsiveImage {
  const main = source(value.src, value.width, value.height, options);
  const out: ResponsiveImage = {
    ...main,
    alt: value.decorative ? "" : (value.alt ?? ""),
    loading: options.priority || options.eager ? "eager" : "lazy",
    decoding: options.priority ? "sync" : "async",
  };
  if (options.sizes && main.srcset) out.sizes = options.sizes;
  if (options.priority) out.fetchpriority = "high";
  const pos = focalPosition(value.focal);
  if (pos) out.objectPosition = pos;
  if (value.phone) {
    const phone = source(value.phone.src, value.phone.width, value.phone.height, options);
    const phonePos = focalPosition(value.phone.focal ?? value.focal);
    out.phone = { ...phone, media: PHONE_MEDIA, ...(phone.srcset && options.sizes ? { sizes: options.sizes } : {}), ...(phonePos ? { objectPosition: phonePos } : {}) };
  }
  if (isSafePlaceholder(value.placeholder)) out.placeholder = value.placeholder;
  return out;
}
