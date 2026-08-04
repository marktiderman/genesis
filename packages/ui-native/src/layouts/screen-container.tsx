/**
 * ScreenContainer — Layer-2 page primitive.
 *
 * Wires the chrome every layout needs without imposing layout structure:
 *   - Safe-area edges (configurable via `safeAreaEdges`)
 *   - StatusBar style (light / dark / auto)
 *   - Scroll vs static body
 *   - Tokens-aware background (`bg-background`)
 *
 * Header customization is delegated: pass `headerLeft`, `headerRight`,
 * `large`, `scrollEdgeBehavior`, `safeAreaEdges`, plus any direct
 * `headerOptions` passthrough to `<Stack.Screen options={...} />`. We
 * **do not** render the navigation header ourselves — Expo Router /
 * React Navigation render the platform-native header. Consumer either:
 *
 *   (a) Wraps the screen in `<ScreenContainer>` and ALSO declares
 *       `<Stack.Screen options={headerOptionsFromProps(props)} />` at the
 *       top of the screen (we export a helper `composeHeaderOptions` for
 *       this), OR
 *   (b) Imports `<NavBarTitle>` / `<NavBarSearchBar>` / `<NavBarSaveButton>`
 *       sub-primitives and threads them through `headerLeft` / `headerRight`
 *       options manually.
 *
 * The Layer-3/4 layouts (SettingsPage, etc.) compose ScreenContainer + a
 * helper that wires Stack.Screen so consumers get the 3-line ergonomics.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import { ScrollView, StatusBar, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "../utils";
import { useThemeMode } from "../hooks/use-theme-mode";

export type SafeAreaEdge = "top" | "bottom" | "left" | "right";

export type ScrollEdgeBehavior = "match" | "transparent" | "opaque";

export interface ScreenContainerProps {
  /** Screen body. Pass any node tree. */
  children: ReactNode;
  /** When `true`, the body is wrapped in a vertical ScrollView. Default `false`. */
  scroll?: boolean;
  /**
   * SafeAreaView edges. Defaults to `["left", "right"]` — top/bottom are
   * normally handled by the navigation header / tab bar.
   */
  safeAreaEdges?: SafeAreaEdge[];
  /**
   * StatusBar appearance. `"auto"` follows the resolved theme mode.
   */
  statusBar?: "light" | "dark" | "auto" | "hidden";
  /**
   * Force light or dark theme on this screen regardless of OS preference.
   * Default `"system"` (follow OS).
   */
  themeMode?: "light" | "dark" | "system";
  /** Override root container className. */
  className?: string;
  /** Override inner content container className (the ScrollView's contentContainerClassName when scroll=true). */
  contentClassName?: string;
  /**
   * `keyboardShouldPersistTaps` for the inner ScrollView. Default `"handled"`.
   * Only used when `scroll` is true.
   */
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  /** testID on the root container. */
  testID?: string;
}

/**
 * Layer-3 named-prop slots that layouts can accept and forward to
 * `composeHeaderOptions()` for `<Stack.Screen options={...}>`.
 */
export interface ScreenHeaderProps {
  /** Custom header title. Falls back to `<Stack.Screen name>` mapping. */
  headerTitle?: string;
  /** Custom node rendered on the left of the nav bar. */
  headerLeft?: () => ReactNode;
  /** Custom node rendered on the right of the nav bar. */
  headerRight?: () => ReactNode;
  /** When true, iOS uses large-title mode + scroll-edge appearance. */
  large?: boolean;
  /** iOS scroll-edge behavior. `"match"` collapses, `"transparent"` always transparent, `"opaque"` always opaque. */
  scrollEdgeBehavior?: ScrollEdgeBehavior;
  /** Direct passthrough merged INTO the resolved options object. Wins over named props. */
  headerOptions?: Record<string, unknown>;
}

/**
 * Compose a `<Stack.Screen options={...}>` object from Layer-3 named
 * props + a direct `headerOptions` passthrough. Layouts call this and
 * pass the result to `<Stack.Screen>` so the host's expo-router stack
 * renders a platform-native large title / scroll-edge appearance.
 *
 * Usage (in a layout primitive):
 *
 *   const opts = composeHeaderOptions({
 *     headerTitle: "Settings",
 *     large: true,
 *     scrollEdgeBehavior: "match",
 *     headerOptions: rest.headerOptions,
 *   });
 *   return <><Stack.Screen options={opts} /><ScreenContainer>...</ScreenContainer></>;
 */
export function composeHeaderOptions(
  props: ScreenHeaderProps,
): Record<string, unknown> {
  const {
    headerTitle,
    headerLeft,
    headerRight,
    large,
    scrollEdgeBehavior,
    headerOptions,
  } = props;

  const opts: Record<string, unknown> = {};
  if (headerTitle !== undefined) opts.title = headerTitle;
  if (headerLeft) opts.headerLeft = headerLeft;
  if (headerRight) opts.headerRight = headerRight;
  if (large) {
    // iOS large-title mode. Android falls back to standard.
    opts.headerLargeTitle = true;
    if (scrollEdgeBehavior === "transparent") {
      opts.headerTransparent = true;
    } else if (scrollEdgeBehavior === "opaque") {
      opts.headerLargeTitleShadowVisible = true;
    }
  }
  // Direct passthrough wins.
  if (headerOptions) {
    Object.assign(opts, headerOptions);
  }
  return opts;
}

const DEFAULT_EDGES: SafeAreaEdge[] = ["left", "right"];

/**
 * Resolve the StatusBar bar style from the user's `statusBar` setting +
 * the resolved theme mode. `"auto"` follows theme; explicit overrides
 * win; anything else falls back to `"default"`.
 */
function resolveBarStyle(
  statusBar: "light" | "dark" | "auto" | "hidden",
  resolvedMode: "light" | "dark",
): "default" | "light-content" | "dark-content" {
  if (statusBar === "auto") {
    return resolvedMode === "dark" ? "light-content" : "dark-content";
  }
  if (statusBar === "light") return "light-content";
  if (statusBar === "dark") return "dark-content";
  return "default";
}

export function ScreenContainer({
  children,
  scroll = false,
  safeAreaEdges = DEFAULT_EDGES,
  statusBar = "auto",
  themeMode = "system",
  className,
  contentClassName,
  keyboardShouldPersistTaps = "handled",
  testID,
}: ScreenContainerProps) {
  const osMode = useThemeMode();
  const resolvedMode = themeMode === "system" ? osMode : themeMode;
  const barStyle = resolveBarStyle(statusBar, resolvedMode);

  const body = scroll ? (
    <ScrollView
      testID={testID ? `${testID}-scroll` : undefined}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName={cn("flex-grow", contentClassName)}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      testID={testID ? `${testID}-body` : undefined}
      className={cn("flex-1", contentClassName)}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      testID={testID ?? "screen-container"}
      edges={safeAreaEdges}
      className={cn("flex-1 bg-background", className)}
    >
      {statusBar !== "hidden" ? (
        <StatusBar
          barStyle={
            barStyle as
              | "default"
              | "light-content"
              | "dark-content"
          }
          translucent
          backgroundColor="transparent"
        />
      ) : (
        <StatusBar hidden />
      )}
      {body}
    </SafeAreaView>
  );
}
