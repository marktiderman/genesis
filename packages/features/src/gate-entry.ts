/**
 * `@marktiderman/genesis-features/gate`: the feature gate without the
 * registry's zod schemas, for code that ships to browsers, phones and edge
 * functions.
 *
 * @stability Beta
 */
export * from "./gate";
export { statusOn } from "./status";
export { FEATURE_PLATFORMS, type FeaturePlatform } from "./platforms";
