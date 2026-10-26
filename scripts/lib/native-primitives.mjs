/**
 * native-primitives.mjs — the React Native primitives Genesis wraps, shared by
 * scripts/check-forbidden-imports.mjs and `genesis doctor`'s native pack
 * (packages/genesis-cli, which bundles this file at build time). One list, so
 * the repo gate and the doctor can't drift.
 *
 * Importing the raw primitive skips Genesis theming and a11y defaults. Keep the
 * list small and intentional: `View`, `Text`, `Pressable`, `ScrollView`,
 * `StyleSheet` stay free imports because layout and performance code needs
 * them. Expanding it is a design-system decision, not a CI tweak.
 *
 * Pure data and functions only: no filesystem, no process state.
 */

/** Primitive → the Genesis components that replace it (the doctor names the ones the installed package exports). */
export const NATIVE_WRAPPED_PRIMITIVES = Object.freeze({
  Modal: Object.freeze(['NativeDialog', 'NativeSheet', 'NativeDrawer']),
  ActivityIndicator: Object.freeze(['NativeLoadingState', 'NativeSkeleton', 'NativeProgress']),
});

/**
 * The wrapped primitives named in one import (or export-from) clause's `{ ... }` list,
 * aliases resolved to the imported name. Type-only entries (`type Modal`) are skipped:
 * they never render anything.
 */
export function wrappedPrimitivesIn(namedImports) {
  return namedImports
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n && !/^type\s/.test(n))
    .map((n) => n.split(/\s+as\s+/)[0].trim())
    .filter((n) => n && Object.hasOwn(NATIVE_WRAPPED_PRIMITIVES, n));
}
