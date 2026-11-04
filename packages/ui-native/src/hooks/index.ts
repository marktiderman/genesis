/**
 * Genesis UI-native hooks — Layer-3/4 helpers.
 *
 * Hooks here are meant for consumer code AND internal Genesis primitives.
 * Group conventions mirror genesis-core/src/hooks (category folders for
 * future growth; flat exports today since the surface is small).
 */

export { useReducedMotion } from "./use-reduced-motion";
// The jump is the shared conversation contract's (genesis-core), re-exported here.
export { useThreadJump, JUMP_SETTLE_MS, type UseThreadJumpOptions } from "@marktiderman/genesis-core/conversation";
export { useMotion, animateMotion, motionSpring, motionTiming, type UseMotionOptions, type MotionHow, type MotionSpringConfig, type MotionTimingConfig } from "./use-motion";
export { useThemeMode, type ThemeMode } from "./use-theme-mode";
export { useThemeRoles, type ThemeRoleColors, type UseThemeRolesOptions } from "./use-theme-roles";
export {
  BrandExtensionsProvider,
  useGenesisExtension,
  type BrandExtensionsValue,
  type BrandExtensionsProviderProps,
} from "./use-genesis-extension";
