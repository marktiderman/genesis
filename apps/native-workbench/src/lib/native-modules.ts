/**
 * The optional native modules Genesis components use when they're given:
 * FlashList v2 for long lists, expo-image for avatars and pictures,
 * Reanimated 4 for toasts, drawers and skeletons, Liquid Glass for floating
 * surfaces on iOS 26, SF Symbols on iOS with lucide everywhere else, and the
 * @expo/ui (SwiftUI / Jetpack Compose) date picker, and React Navigation's
 * theming (GenesisNativeApp themes headers and tab bars in the brand's light
 * and dark colors), and keyboard-controller's KeyboardAvoidingView for
 * ThreadPage's composer, gesture-handler's ReanimatedSwipeable for every row's swipe actions,
 * @expo/ui's MenuView for the system long-press menu, and expo-router's focus, path and
 * Stack.Screen for each screen's native header and tab bar (docs/FRAMEWORK.md, "Native screens
 * follow iOS"). To fall back to plain
 * React Native for one, delete its line, its import below and its package.
 */
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { FlashList } from "@shopify/flash-list";
import * as GlassEffect from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { MenuView } from "@expo/ui/community/menu";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useFocusEffect, usePathname } from "expo-router";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { SymbolView } from "expo-symbols";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
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
  navigation: { ThemeProvider, DefaultTheme, DarkTheme },
  // ThreadPage's composer follows the keyboard frame by frame.
  keyboardAvoidingView: KeyboardAvoidingView,
  // expo-haptics, once: useHaptics(), playHaptic and NativeButton's `haptic` play through it.
  haptics: Haptics as unknown as GenesisModules["haptics"],
  // A row's actions behind a swipe (NativeSwipeRow, InboxPage, NativeResourceView, NativeListItem).
  swipeable: ReanimatedSwipeable as unknown as GenesisModules["swipeable"],
  // The long press opens the system context menu (UIContextMenu) with a row's actions.
  menu: MenuView as unknown as GenesisModules["menu"],
  // Per-screen tab bar (useHideTabBar) and native header (ScreenContainer `header`) follow the router.
  router: { useFocusEffect: useFocusEffect as never, usePathname, StackScreen: Stack.Screen as never },
};
