/**
 * Where a feature runs. `server` covers Node, edge functions and the database.
 *
 * @stability Beta
 */
export const FEATURE_PLATFORMS = ["web", "native", "server", "cli"] as const;

/** @stability Beta */
export type FeaturePlatform = (typeof FEATURE_PLATFORMS)[number];
