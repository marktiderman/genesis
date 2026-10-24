/**
 * @marktiderman/genesis-native — the native app shell.
 *
 * Rung 1: `<GenesisNativeApp>`. Rung 2: its `slots` / `slotProps`.
 * Rungs 3 and 4: each part below on its own, as a primitive and a hook.
 * Query persistence is in `@marktiderman/genesis-native/persist`.
 *
 * @stability Beta
 */
export {
  GenesisNativeApp,
  type GenesisNativeAppProps,
  type NativeAppSlots,
  type NativeQueryClientOptions,
  BootScreen,
  type SplashModule,
  type BootScreenProps,
  type SignedOutProps,
} from "./app";
export {
  createBoot,
  BootProvider,
  useBoot,
  BootTimeoutError,
  type BootController,
  type BootOptions,
  type BootState,
  type BootStatus,
  type BootStep,
  type BootStepContext,
  type UseBootReturn,
} from "./boot";
export {
  FatalScreen,
  PlainFatalScreen,
  GenesisErrorBoundary,
  installGlobalErrorHandler,
  installRejectionTracker,
  defaultErrorUtils,
  defaultRejectionTracker,
  type EnableRejectionTracker,
  type ErrorReport,
  type ErrorUtilsLike,
  type FatalScreenProps,
  type GenesisErrorBoundaryProps,
  type GlobalErrorHandlerOptions,
  type OnError,
} from "./errors";
export {
  createNativeQueryClient,
  connectQueryLifecycle,
  DAY_MS,
  type AppStateLike,
  type AsyncStorageLike,
  type NetInfoLike,
  type QueryLifecycleOptions,
  type QueryPersistence,
} from "./query";
export { createHydrationGate, type HydrationGate, type HydrationGateOptions } from "./hydration-gate";
export {
  AuthGate,
  SessionProvider,
  createSessionStore,
  useSession,
  type AuthClientLike,
  type AuthGateProps,
  type SessionState,
  type SessionStatus,
  type SessionStore,
  type SessionStoreOptions,
} from "./auth";
export { normalizeLink, type LinkOptions, type LinkTarget } from "./links";
export { createLinkHold, useHeldLink, type HeldLinkAuth, type LinkHold, type UseHeldLinkOptions } from "./held-link";
export {
  useBlocks,
  useBlockSettings,
  mergeBlockSettings,
  type BlockSettingsSection,
  type NativeBlock,
  type NativeBlockRootProps,
  type SettingsRowLike,
  type UseBlockSettingsOptions,
} from "./blocks";
