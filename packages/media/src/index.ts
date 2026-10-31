/**
 * @marktiderman/genesis-media: images and files for Genesis apps.
 *
 * - `ImageValue`: one image as an app stores it (alt or decorative, size,
 *   focal point, phone crop, blur placeholder).
 * - `responsiveImage(value, { imageUrl, sizes, widths, priority })`: the
 *   `<img>` attributes that load it at the right size and priority.
 * - `ImageUrlBuilder`, with `supabaseImageUrl` (Supabase Storage transforms)
 *   and `passThroughImageUrl` (no transforms).
 * - `sniff(bytes)`: what a file is by its bytes, and an image's size.
 *
 * The server side (the fetch guarded against request forgery) is
 * `@marktiderman/genesis-media/server`. Signed links to private media and
 * ZIP bundles are `@marktiderman/genesis-media/signed` (server and edge
 * only: the signer's secret never reaches a browser).
 *
 * @packageDocumentation
 */
export {
  DEFAULT_WIDTHS,
  MAX_PLACEHOLDER,
  PHONE_MEDIA,
  focalPosition,
  isSafePlaceholder,
  passThroughImageUrl,
  responsiveImage,
  srcsetWidths,
  supabaseImageUrl,
  type FocalPoint,
  type ImageFormat,
  type ImageUrlBuilder,
  type ImageUrlOptions,
  type ImageValue,
  type PhoneCrop,
  type ResponsiveImage,
  type ResponsiveImageOptions,
  type ResponsiveSource,
  type SupabaseImageUrlOptions,
} from "./image";
export { sniff, type Sniffed } from "./sniff";
