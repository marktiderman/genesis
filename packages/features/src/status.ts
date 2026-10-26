import type { FeatureStatus } from "./model";
import type { FeaturePlatform } from "./platforms";

/**
 * A feature's status on one platform, or undefined when it isn't there.
 * Zod-free so the gate can use it on phones and in browsers.
 *
 * @stability Beta
 */
export function statusOn(
  def: {
    status: FeatureStatus;
    apps: readonly string[];
    platforms?: Partial<Record<FeaturePlatform, FeatureStatus>>;
  },
  platform: FeaturePlatform,
): FeatureStatus | undefined {
  if (def.platforms) return def.platforms[platform];
  // Registries often call the server "node" in `apps`.
  const apps = def.apps.map((a) => (a === "node" ? "server" : a));
  return apps.includes(platform) ? def.status : undefined;
}
