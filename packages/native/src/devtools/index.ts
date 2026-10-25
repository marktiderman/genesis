/**
 * `@marktiderman/genesis-native/devtools`: the devtools overlay for
 * development, preview and internal builds. Import it only behind a
 * condition Metro folds at build time, so production bundles leave it out:
 *
 * ```ts
 * export const devtools =
 *   __DEV__ || process.env.EXPO_PUBLIC_APP_VARIANT === "preview"
 *     ? require("./devtools-overlay").createAppDevtools()
 *     : undefined;
 * ```
 *
 * Rung 1: `<GenesisNativeApp blocks={[devtools]}>`. Rung 2: the
 * `devtoolsFeedback` slot. Rung 3: `createHoldDetector`,
 * `createShakeDetector`, `buildDebugInfo`.
 *
 * @stability Beta
 */
export { createDevtools, DEVTOOLS_BLOCK_ID, type DevSettingsLike, type DevtoolsBlock, type DevtoolsOptions, type DevtoolsState } from "./block";
export { createHoldDetector, createShakeDetector, type AccelerometerLike, type HoldDetector, type HoldDetectorOptions, type ShakeDetector, type ShakeDetectorOptions } from "./gestures";
export { buildDebugInfo, type DebugInfoInput } from "./info";
export type { DevtoolsFeedbackProps, DevtoolsSlots } from "./slots";
