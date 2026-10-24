/**
 * `@marktiderman/genesis-native/updates`: force upgrade, maintenance, the
 * update banner, what's new, and the version signature for internal builds.
 *
 * Rung 1: `<GenesisNativeApp updates={createUpdates(…)}>`. Rung 2: its
 * `forceUpgrade`, `maintenance`, `updateBanner` and `whatsNew` slots. Rung 3:
 * the screens (`ForceUpgradeScreen`, …) and stores (`createPolicyStore`, …).
 * Rung 4: the hooks (`useForceUpgrade`, …) under `UpdatesProvider`.
 *
 * Optional peers: `expo-updates` (banner, channels) and `expo-application`
 * (the installed version), passed in rather than imported.
 *
 * @stability Beta
 */
export {
  createUpdates,
  UPDATES_BLOCK_ID,
  UpdatesProvider,
  UpdatesRoot,
  useUpdates,
  useBlockReload,
  useUpdatePolicy,
  useUpdateVerdict,
  useForceUpgrade,
  useMaintenance,
  useUpdateCheck,
  useCanReload,
  useUpdateBanner,
  useWhatsNew,
  useVersionSignature,
  type UpdatesBlock,
  type UpdatesOptions,
  type UpdatesRootProps,
  type UpdatesSlots,
} from "./block";
export {
  ForceUpgradeScreen,
  MaintenanceScreen,
  UpdateBanner,
  WhatsNewSheet,
  type ForceUpgradeProps,
  type MaintenanceProps,
  type UpdateBannerProps,
  type WhatsNewProps,
} from "./screens";
export {
  createPolicyStore,
  evaluatePolicy,
  sanitizePolicy,
  staticPolicySource,
  supabasePolicySource,
  CLOCK_SKEW_MS,
  WEEK_MS,
  type EvaluatePolicyOptions,
  type PolicyClientLike,
  type PolicyOrigin,
  type PolicyState,
  type PolicyStore,
  type PolicyStoreOptions,
  type ReleaseNote,
  type SupabasePolicySourceOptions,
  type UpdatePlatform,
  type UpdatePolicy,
  type UpdatePolicySource,
  type UpdateVerdict,
} from "./policy";
export {
  createUpdateChecker,
  createReloadGuard,
  type ReloadGuard,
  type UpdateChecker,
  type UpdateCheckerOptions,
  type UpdateCheckState,
  type UpdateCheckStatus,
} from "./checker";
export { createWhatsNewStore, notesSince, type WhatsNewOptions, type WhatsNewState, type WhatsNewStore } from "./whats-new";
export { versionSignature, type VersionSignature, type VersionSignatureInput } from "./signature";
export { createChannelSwitcher, type ChannelSwitcher, type ChannelSwitcherOptions, type ChannelSwitchResult } from "./channels";
export { compareVersions, isBelowMinimum, parseVersion } from "./version";
export type {
  ApplicationLike,
  UpdatesAppStateLike,
  UpdatesErrorSource,
  UpdatesModuleLike,
  UpdatesOnError,
  UpdatesStorageLike,
} from "./modules";
