/**
 * ScreenContainer — Layer-2 page primitive.
 *
 * Wires the chrome every layout needs without imposing layout structure:
 *   - Safe-area edges (configurable via `safeAreaEdges`)
 *   - StatusBar style (light / dark / auto)
 *   - Scroll vs static body
 *   - Tokens-aware background (`bg-background`)
 *   - A loading state (`loading`): a centred `NativeLoadingState` in place of the body
 *   - Pull to refresh (`onRefresh` + `refreshing`): a theme-tinted `NativeRefreshControl`
 *
 *   - The native header (`header`): a large title that collapses on scroll, native header
 *     items and native search, set from inside the screen through `GenesisModules.router.StackScreen`
 *   - Tab bar visibility (`tabBar="hidden"`): UIKit's `hidesBottomBarWhenPushed`, through
 *     `useHideTabBar` and the tabs layout's `TabBarVisibilityProvider`
 *
 * The rule (docs/FRAMEWORK.md, "Native screens follow iOS"): every screen uses the stack's native
 * header, never one it draws. Top-level screens take a large title; a drill-down takes a standard
 * one (`large: false`) and the stack's own back button.
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
import { useMemo, type ReactNode } from "react";
import { useGenesisModules } from "../native-modules";
import { useHideTabBar } from "./tab-bar-visibility";
import { ScrollView, StatusBar, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "../utils";
import { useThemeMode } from "../hooks/use-theme-mode";
import { NativeLoadingState } from "../components/loading-state";
import { NativeRefreshControl } from "../components/refresh-control";

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
  /**
   * When `true`, a centred `NativeLoadingState` (theme-tinted spinner,
   * announced as loading) replaces the body, inside the same safe area and
   * background. Use it for redirect and first-load screens: the body is
   * unmounted while it's on, so a form underneath loses its state. Default `false`.
   */
  loading?: boolean;
  /** Text under the spinner while `loading`, and what screen readers announce: pass translated text. */
  loadingLabel?: string;
  /**
   * Pull to refresh: a theme-tinted `NativeRefreshControl` on the body, as InboxPage and
   * NotificationsPage have. Pulling needs a scroll view, so passing it makes the body scroll
   * (as `scroll`). Off unless passed. Never with a list child (FlatList, SectionList,
   * NativeResourceView, InboxPage): a list inside a ScrollView loses virtualization, and those
   * lists have their own pull to refresh.
   */
  onRefresh?: () => void | Promise<void>;
  /** The refresh spinner shows while `true`: pass your query's refetching state. Default `false`. */
  refreshing?: boolean;
  /** Style on the root, e.g. a theme-role background color. */
  style?: ViewStyle;
  /** testID on the root container. */
  testID?: string;
  /**
   * The tab bar while this screen is focused. `"hidden"` hides it (a conversation, a full-screen
   * viewer, a form pushed over a list), as UIKit's `hidesBottomBarWhenPushed`; the stack's back
   * button and edge swipe stay. Needs `TabBarVisibilityProvider` around the tabs. Default `"visible"`.
   */
  tabBar?: "visible" | "hidden";
  /**
   * The screen's native header, set from inside the screen: `composeHeaderOptions` of these, passed
   * to `GenesisModules.router.StackScreen` (expo-router's `Stack.Screen`). `large` defaults to
   * `true` here, a large title that collapses on scroll; pass `large: false` on a drill-down.
   * Without the router module, set `<Stack.Screen options={composeHeaderOptions(…)}>` yourself.
   * Every option is set each time, so leaving one out resets it (no large title, no search). Keep
   * `search`, the callbacks and `headerOptions` stable (useMemo / useCallback): they're compared by
   * reference.
   */
  header?: ScreenHeaderProps;
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
  /**
   * Native search in the header (react-native-screens' `headerSearchBarOptions`): the system
   * search field under the large title, which hides on scroll. On iOS 26 pass
   * `placement: "integrated"` (or `"integratedButton"`) to put it in the toolbar; with a tab bar,
   * search is usually its own tab (`role: "search"` on NativeTabs). Never draw your own.
   */
  search?: ScreenSearchOptions;
  /**
   * Native header items on the right (react-native-screens' `unstable_headerRightItems`): bar
   * buttons and menus drawn by UIKit, with iOS 26's glass grouping. Prefer them to `headerRight`.
   */
  headerRightItems?: () => readonly unknown[];
  /** Native header items on the left (`unstable_headerLeftItems`). */
  headerLeftItems?: () => readonly unknown[];
  /** Direct passthrough merged INTO the resolved options object. Wins over named props. */
  headerOptions?: Record<string, unknown>;
}

/** `headerSearchBarOptions`, written structurally: the fields Genesis names, and the rest passed through. */
export interface ScreenSearchOptions {
  placeholder?: string;
  onChangeText?: (event: { nativeEvent: { text: string } }) => void;
  onSearchButtonPress?: (event: { nativeEvent: { text: string } }) => void;
  onCancelButtonPress?: () => void;
  /** Keep it visible while scrolling. Default: it hides as the list scrolls (iOS's default). */
  hideWhenScrolling?: boolean;
  /** `"automatic" | "inline" | "stacked" | "integrated" | "integratedButton" | "integratedCentered"`: iOS 26 adds the integrated ones. */
  placement?: string;
  autoCapitalize?: "none" | "words" | "sentences" | "characters" | "systemDefault";
  [option: string]: unknown;
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
    search,
    headerRightItems,
    headerLeftItems,
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
  // An explicit `false` turns off a large title a navigator or an earlier render set (setOptions merges).
  if (large === false) opts.headerLargeTitle = false;
  if (search) opts.headerSearchBarOptions = search;
  if (headerRightItems) opts.unstable_headerRightItems = headerRightItems;
  if (headerLeftItems) opts.unstable_headerLeftItems = headerLeftItems;
  // Direct passthrough wins.
  if (headerOptions) {
    Object.assign(opts, headerOptions);
  }
  return opts;
}

/**
 * Hides the tab bar while the screen is focused. A component of its own, so only a screen that
 * asks reads focus: ScreenContainer also draws sheets and screens outside any navigator, where
 * the router's focus hook has nothing to read.
 */
function HideTabBar() {
  useHideTabBar();
  return null;
}

const DEFAULT_EDGES: SafeAreaEdge[] = ["left", "right"];

// A see-through Android status bar. React Native 0.88 dropped both props from StatusBar's types
// (Android is always edge to edge there, so they do nothing); earlier versions still need them.
// Spread untyped so the screen compiles against either.
const TRANSLUCENT_ANDROID_BAR: Record<string, unknown> = { translucent: true, backgroundColor: "transparent" };

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
  loading = false,
  loadingLabel,
  onRefresh,
  refreshing = false,
  style,
  testID,
  tabBar = "visible",
  header,
}: ScreenContainerProps) {
  const { router } = useGenesisModules();
  const StackScreen = router?.StackScreen;
  // Each option is set explicitly, the large title and search included, so taking one away (a
  // drill-down's `large: false`, a search that goes) resets what the layout or a render before set.
  const h = header;
  const headerOptions = useMemo(
    () => {
      if (!h) return null;
      const large = h.large ?? true;
      return {
        headerLargeTitle: large,
        headerSearchBarOptions: undefined,
        headerLeft: undefined,
        headerRight: undefined,
        headerTransparent: undefined,
        headerLargeTitleShadowVisible: undefined,
        unstable_headerRightItems: undefined,
        unstable_headerLeftItems: undefined,
        ...composeHeaderOptions({ scrollEdgeBehavior: "match", ...h, large }),
      };
    },
    // By field, so an inline `header={{…}}` doesn't set the options on every render; keep `search`,
    // the callbacks and `headerOptions` stable (useMemo / useCallback) for the same reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!h, h?.headerTitle, h?.large, h?.scrollEdgeBehavior, h?.search, h?.headerLeft, h?.headerRight, h?.headerRightItems, h?.headerLeftItems, h?.headerOptions],
  );
  const osMode = useThemeMode();
  const resolvedMode = themeMode === "system" ? osMode : themeMode;
  const barStyle = resolveBarStyle(statusBar, resolvedMode);

  const body = loading ? (
    <View testID={testID ? `${testID}-body` : undefined} className={cn("flex-1", contentClassName)}>
      <NativeLoadingState fullScreen={false} label={loadingLabel} testID={`${testID ?? "screen-container"}-loading`} />
    </View>
  ) : scroll || onRefresh ? (
    <ScrollView
      testID={testID ? `${testID}-scroll` : undefined}
      refreshControl={
        onRefresh ? (
          <NativeRefreshControl testID={`${testID ?? "screen-container"}-refresh`} refreshing={refreshing} onRefresh={() => void onRefresh()} />
        ) : undefined
      }
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
      style={style}
    >
      {headerOptions && StackScreen ? <StackScreen options={headerOptions} /> : null}
      {tabBar === "hidden" ? <HideTabBar /> : null}
      {statusBar !== "hidden" ? (
        <StatusBar
          barStyle={
            barStyle as
              | "default"
              | "light-content"
              | "dark-content"
          }
          {...TRANSLUCENT_ANDROID_BAR}
        />
      ) : (
        <StatusBar hidden />
      )}
      {body}
    </SafeAreaView>
  );
}
