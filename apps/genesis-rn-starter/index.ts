/**
 * The app's entry. In development, first keep the dependency warnings the app can't act on out of
 * LogBox: React Native 0.88 pins "Open debugger to view warnings." over the tab bar on the first
 * warning, where it takes the first tab tap. NativeWind's runtime warns while expo-router loads the
 * first screen, so this runs before expo-router's entry (a `require`, so it isn't hoisted above
 * the call). See `@marktiderman/genesis-native/dev-warnings`.
 */
import { LogBox } from "react-native";
import { ignoreKnownDependencyWarnings } from "@marktiderman/genesis-native/dev-warnings";

ignoreKnownDependencyWarnings(LogBox, __DEV__);

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("expo-router/entry");
