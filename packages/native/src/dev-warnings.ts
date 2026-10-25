/**
 * Development-only warnings from the libraries a Genesis native app is built on, that the app
 * can't act on, kept out of LogBox.
 *
 * Why it matters: in React Native 0.88 (Expo SDK 58), LogBox no longer lists warnings while no
 * debugger is attached. The first one instead shows a pill, "Open debugger to view warnings.", pinned to the bottom of the screen,
 * over the native tab bar (`expo-router/native-tabs`). A tap meant for a tab lands on the pill
 * (which opens the debugger and goes away), so the first tab tap after a launch, or after a link
 * opened the app, seems to do nothing. In the starter on Expo SDK 58 the warning was React
 * Native's own deprecation of `ImageBackground`, read by NativeWind's runtime
 * (`react-native-css-interop` 0.2 registers every core component at start-up).
 *
 * Only warnings with no fix in the app belong here: one the app causes should be fixed, and still
 * shows. Each pattern names where it comes from and when to remove it. Release builds have no
 * LogBox, so this does nothing there.
 *
 * It has to run before any library loads: NativeWind's runtime warns while the first screen
 * module is still being required, long before `GenesisNativeApp` renders. So the app's entry
 * file calls it, then requires expo-router's entry (the starter's `index.ts`):
 *
 *   import { LogBox } from "react-native";
 *   import { ignoreKnownDependencyWarnings } from "@marktiderman/genesis-native/dev-warnings";
 *   ignoreKnownDependencyWarnings(LogBox, __DEV__);
 *   require("expo-router/entry");
 */

export interface LogBoxLike {
  ignoreLogs(patterns: ReadonlyArray<string | RegExp>): void;
}

/** The warnings, matched on their text. */
export const KNOWN_DEPENDENCY_WARNINGS: readonly RegExp[] = [
  // react-native-css-interop 0.2.x (NativeWind 4) reads `ImageBackground` from React Native's
  // index, whose getter warns from 0.88. Remove once css-interop stops touching it.
  /^ImageBackground is deprecated and will be removed in a future release\./,
];

/** Keep the known dependency warnings out of LogBox (development only). Returns whether it did. */
export function ignoreKnownDependencyWarnings(logBox: LogBoxLike | undefined, dev: boolean): boolean {
  if (!dev || !logBox) return false;
  logBox.ignoreLogs(KNOWN_DEPENDENCY_WARNINGS);
  return true;
}
