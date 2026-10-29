/**
 * @marktiderman/genesis-media/signed: signed links to private media, and
 * ZIP bundles of many files. Fetch and WebCrypto only (Node 20+ and Workers).
 *
 * Server and edge only. The signer's secret both signs and verifies, so it
 * must never reach a browser: a browser only ever receives finished signed
 * URLs. This entry resolves to nothing under the `browser` condition, so a
 * page bundle that imports it fails to build.
 *
 * - `createMediaSigner({ secret | keys, ttl?, align?, now? })`: `sign`, `verify`, `signMediaUrl`.
 * - `mediaScope.item | file | download | bundle`: what a link opens.
 * - `createSignedMediaHandler({ storage, signer, route })`: serves the links.
 * - `createZipManifest` and `createBundleHandler`: a streaming ZIP of many files.
 * - `createSignedImageUrls(signer, { base, derivatives, items })`: an
 *   `ImageUrlBuilder` of signed derivatives, for `responsiveImage`.
 * - `MediaStorage`, with `createMemoryStorage` for tests.
 *
 * @packageDocumentation
 */
export { mediaScope, type MediaScope, type MediaScopeKind } from "./scope";
export {
  DEFAULT_MEDIA_TTL,
  MAX_MEDIA_TTL,
  MIN_MEDIA_TTL,
  createMediaSigner,
  type MediaSecret,
  type MediaSignOptions,
  type MediaSigner,
  type MediaSignerOptions,
  type MediaToken,
  type MediaTokenInput,
  type MediaTtl,
} from "./signer";
export {
  createSignedMediaHandler,
  ifRangeMatches,
  parseRange,
  type MediaRoute,
  type MediaRouteContext,
  type SignedMediaHandlerOptions,
} from "./handler";
export {
  MAX_ZIP_ENTRIES,
  createBundleHandler,
  createZipManifest,
  type BundleHandlerOptions,
  type CreateZipManifestInput,
  type ZipManifest,
  type ZipManifestEntry,
} from "./bundle";
export {
  createSignedImageUrls,
  finishSizes,
  mediaSrc,
  parseSignedImagePath,
  type ImageDerivative,
  type MediaItemRef,
  type SignedImageUrls,
  type SignedImageUrlsOptions,
} from "./images";
export {
  createMemoryStorage,
  type MediaObject,
  type MediaObjectInfo,
  type MediaRange,
  type MediaStorage,
  type MemoryObject,
} from "./storage";
