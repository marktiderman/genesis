/**
 * GenesisModulesProvider — the native modules an app opts in to, passed in
 * once near the root. Genesis never `require()`s these itself: an app that
 * has a module installed imports it and hands it over, and every component
 * that could use it falls back to plain React Native when it isn't here.
 *
 *   import { FlashList } from "@shopify/flash-list";
 *   import { Image } from "expo-image";
 *   import * as Reanimated from "react-native-reanimated";
 *   import * as GlassEffect from "expo-glass-effect";
 *   import { SymbolView } from "expo-symbols";
 *   import DateTimePicker from "@expo/ui/community/datetime-picker";
 *   import { lucideIcons } from "@marktiderman/genesis-ui-native/icons/lucide";
 *   import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
 *
 *   // At module scope, not inline:
 *   const modules = { list: FlashList, image: Image, reanimated: Reanimated, glass: GlassEffect,
 *                     symbol: SymbolView, icons: lucideIcons, datePicker: DateTimePicker,
 *                     navigation: { ThemeProvider, DefaultTheme, DarkTheme } };
 *   <GenesisModulesProvider modules={modules}>…</GenesisModulesProvider>
 *
 * (`GenesisNativeApp` from `@marktiderman/genesis-native` takes the same
 * object as its `modules` prop and mounts this for you.)
 *
 * | Module                         | Used by                                  | Without it                    |
 * | ------------------------------ | ---------------------------------------- | ----------------------------- |
 * | `list` (FlashList v2)          | NativeResourcePage, NotificationsPage    | FlatList / SectionList        |
 * | `image` (expo-image)           | NativeAvatar, NativeImage                | React Native `Image`          |
 * | `reanimated` (Reanimated 4)    | Toast, Drawer, Skeleton                  | React Native `Animated`       |
 * | `glass` (expo-glass-effect)    | Toast, NativeGlassSurface, update banner | the solid surface             |
 * | `symbol` (expo-symbols)        | NativeIcon on iOS                        | `icons` (lucide)              |
 * | `icons` (a lucide icon set)    | NativeIcon on Android, web, and as the SF Symbol fallback | a blank space of the icon's size |
 * | `datePicker` (@expo/ui)        | NativeDatePicker, NativeTimePicker       | @react-native-community/datetimepicker |
 * | `navigation` (React Navigation's theming: from `expo-router` in an Expo Router app, which bundles its own copy; `@react-navigation/native` otherwise) | GenesisNativeApp: headers and tab bars in the brand's light and dark colors | React Navigation's default (light) theme |
 *
 * The props below are written structurally (no import of the optional
 * packages), so this package builds and type-checks without any of them.
 *
 * @stability Beta
 */
import { createContext, createElement, useContext, useMemo, type ComponentType, type ReactNode } from "react";
import type { ColorValue } from "react-native";
import type { NativeIconName } from "./icon-names";

/** The FlatList props Genesis lists pass; FlashList v2 takes the same ones. */
export interface GenesisListProps<T> {
  data: readonly T[];
  renderItem: (info: { item: T; index: number }) => ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  getItemType?: (item: T, index: number) => string | number | undefined;
  stickyHeaderIndices?: number[];
  /** FlashList v2's: `offset` moves sticky headers down from the list's top (under a native header). */
  stickyHeaderConfig?: { offset?: number };
  ListHeaderComponent?: ReactNode | ComponentType<unknown> | null;
  ListEmptyComponent?: ReactNode | ComponentType<unknown> | null;
  contentContainerStyle?: Record<string, unknown>;
  refreshing?: boolean;
  onRefresh?: () => void;
  refreshControl?: ReactNode;
  testID?: string;
}

/** `FlashList` from `@shopify/flash-list` v2 (New Architecture only; no `estimatedItemSize`). */
export type GenesisListComponent = ComponentType<GenesisListProps<any>>;

/** The expo-image `Image` props Genesis passes. */
export interface GenesisImageProps {
  source: { uri: string } | number | null;
  style?: unknown;
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  placeholder?: unknown;
  placeholderContentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  transition?: number | null;
  recyclingKey?: string | null;
  priority?: "low" | "normal" | "high" | null;
  onError?: (event: unknown) => void;
  onLoad?: (event: unknown) => void;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** `Image` from `expo-image`. */
export type GenesisImageComponent = ComponentType<GenesisImageProps>;

/** `import * as Reanimated from "react-native-reanimated"` (v4). Only what Genesis calls is listed. */
export interface GenesisReanimatedModule {
  default: { View: ComponentType<any> };
  useSharedValue: <V>(initial: V) => { value: V };
  useAnimatedStyle: (updater: () => Record<string, unknown>, deps?: unknown[]) => Record<string, unknown>;
  withTiming: (toValue: number, config?: { duration?: number; easing?: unknown; reduceMotion?: unknown }, callback?: (finished?: boolean) => void) => number;
  withRepeat: (animation: number, numberOfReps?: number, reverse?: boolean, callback?: unknown, reduceMotion?: unknown) => number;
  cancelAnimation: (value: { value: unknown }) => void;
  Easing: { inOut: (easing: unknown) => unknown; ease: unknown; out: (easing: unknown) => unknown; cubic: unknown };
  ReduceMotion?: { System: unknown; Always: unknown; Never: unknown };
}

/** `import * as GlassEffect from "expo-glass-effect"`. */
export interface GenesisGlassModule {
  GlassView: ComponentType<{
    style?: unknown;
    glassEffectStyle?: "regular" | "clear" | "none";
    tintColor?: string;
    isInteractive?: boolean;
    colorScheme?: "auto" | "light" | "dark";
    children?: ReactNode;
    testID?: string;
    pointerEvents?: "box-none" | "none" | "box-only" | "auto";
  }>;
  isLiquidGlassAvailable: () => boolean;
  isGlassEffectAPIAvailable: () => boolean;
}

/** The expo-symbols `SymbolView` props Genesis passes. */
export interface GenesisSymbolProps {
  name: string;
  size?: number;
  tintColor?: ColorValue;
  type?: "monochrome" | "hierarchical" | "palette" | "multicolor";
  weight?: string;
  fallback?: ReactNode;
  style?: unknown;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** `SymbolView` from `expo-symbols`. */
export type GenesisSymbolComponent = ComponentType<GenesisSymbolProps>;

/** A lucide-style icon component: `size`, `color`, `strokeWidth`. */
export type GenesisIconComponent = ComponentType<{ size?: number; color?: ColorValue; strokeWidth?: number; testID?: string }>;

/** Icon components by semantic name (`lucideIcons` from `/icons/lucide` is one). Missing names draw nothing. */
export type GenesisIconSet = Partial<Record<NativeIconName, GenesisIconComponent>>;

/** The `@expo/ui/community/datetime-picker` props Genesis passes (a drop-in for the community picker). */
export interface GenesisDatePickerProps {
  value: Date;
  mode: "date" | "time";
  display?: "default" | "compact" | "spinner" | "inline";
  presentation?: "inline" | "dialog";
  disabled?: boolean;
  onValueChange?: (event: unknown, date: Date) => void;
  onDismiss?: () => void;
  style?: unknown;
  testID?: string;
}

/** The default export of `@expo/ui/community/datetime-picker`. */
export type GenesisDatePickerComponent = ComponentType<GenesisDatePickerProps>;

/** A React Navigation theme (`ReactNavigation.Theme`): the colors Genesis sets, and the fonts it keeps. */
export interface GenesisNavigationTheme {
  dark: boolean;
  colors: { primary: ColorValue; background: ColorValue; card: ColorValue; text: ColorValue; border: ColorValue; notification: ColorValue };
  fonts?: unknown;
}

/**
 * React Navigation's theming. In an Expo Router app take it from `expo-router`: it bundles its own
 * React Navigation, and its navigators read that copy's theme, not `@react-navigation/native`'s.
 */
export interface GenesisNavigationModule {
  ThemeProvider: ComponentType<{ value: any; children: ReactNode }>;
  DefaultTheme: GenesisNavigationTheme;
  DarkTheme: GenesisNavigationTheme;
}

/** Every optional native module Genesis components can use. Each is optional on its own. */
export interface GenesisModules {
  list?: GenesisListComponent;
  image?: GenesisImageComponent;
  reanimated?: GenesisReanimatedModule;
  glass?: GenesisGlassModule;
  symbol?: GenesisSymbolComponent;
  icons?: GenesisIconSet;
  datePicker?: GenesisDatePickerComponent;
  navigation?: GenesisNavigationModule;
}

const EMPTY: GenesisModules = Object.freeze({});
const GenesisModulesContext = createContext<GenesisModules>(EMPTY);

export interface GenesisModulesProviderProps {
  modules: GenesisModules;
  children: ReactNode;
}

/**
 * Pass the optional native modules the app has installed. Nested providers
 * merge: an inner one adds to or replaces what an outer one gave. Define the
 * `modules` object once at module scope (as the starter's
 * `src/lib/native-modules.ts` does): a new inline object on every render
 * re-renders every component that reads it.
 */
export function GenesisModulesProvider({ modules, children }: GenesisModulesProviderProps) {
  const outer = useContext(GenesisModulesContext);
  const value = useMemo(() => (outer === EMPTY ? modules : { ...outer, ...modules }), [outer, modules]);
  return createElement(GenesisModulesContext.Provider, { value }, children);
}

/** The modules given to the nearest `GenesisModulesProvider`; `{}` without one. */
export function useGenesisModules(): GenesisModules {
  return useContext(GenesisModulesContext);
}
