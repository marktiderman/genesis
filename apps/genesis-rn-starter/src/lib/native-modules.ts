/**
 * The optional native modules Genesis components use when they're given:
 * FlashList v2 for long lists, expo-image for avatars and pictures,
 * Reanimated 4 for toasts, drawers and skeletons, Liquid Glass for floating
 * surfaces on iOS 26, SF Symbols on iOS with lucide everywhere else, and the
 * @expo/ui (SwiftUI / Jetpack Compose) date picker. Remove a line (and its
 * package) to fall back to plain React Native for that one.
 */
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { FlashList } from "@shopify/flash-list";
import * as GlassEffect from "expo-glass-effect";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import * as Reanimated from "react-native-reanimated";
import type { GenesisModules } from "@marktiderman/genesis-ui-native";
import { lucideIcons } from "@marktiderman/genesis-ui-native/icons/lucide";

// Genesis describes each module by the props it passes, so the packages' own (wider) types are cast once here.
export const nativeModules: GenesisModules = {
  list: FlashList as unknown as GenesisModules["list"],
  image: Image as unknown as GenesisModules["image"],
  reanimated: Reanimated as unknown as GenesisModules["reanimated"],
  glass: GlassEffect as unknown as GenesisModules["glass"],
  symbol: SymbolView as unknown as GenesisModules["symbol"],
  icons: lucideIcons,
  datePicker: DateTimePicker as unknown as GenesisModules["datePicker"],
};
