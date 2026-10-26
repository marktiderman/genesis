// react-native -> jsdom shim for unit tests.
//
// Maps RN primitives to plain DOM elements so @testing-library/react can
// drive them with normal events. testID, accessibilityRole, etc. are
// forwarded as data-* and aria-* attributes for assertion.
import * as React from "react";

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

// Translate RN-style props to DOM-friendly equivalents.
function toDom<T extends AnyProps>(
  props: T,
  defaultRole?: string
): Record<string, unknown> {
  const {
    testID,
    accessibilityLabel,
    accessibilityHint,
    accessibilityRole,
    accessibilityState,
    accessibilityValue,
    accessibilityElementsHidden,
    accessibilityViewIsModal,
    accessibilityLiveRegion,
    importantForAccessibility,
    onPress,
    onLongPress,
    onLayout,
    accessibilityActions,
    onAccessibilityAction,
    onPressIn,
    onPressOut,
    pointerEvents,
    hitSlop,
    collapsable,
    style,
    className,
    children,
    ...rest
  } = props as AnyProps & {
    onPress?: () => void;
    onLongPress?: () => void;
    onLayout?: (e: unknown) => void;
  };
  void onLayout;
  void onPressIn;
  void onPressOut;
  void pointerEvents;
  void hitSlop;
  void collapsable;
  void importantForAccessibility;
  void accessibilityViewIsModal;
  void accessibilityLiveRegion;

  const out: Record<string, unknown> = { ...rest, children };
  if (testID !== undefined) out["data-testid"] = testID;
  if (accessibilityLabel !== undefined) out["aria-label"] = accessibilityLabel;
  if (accessibilityHint !== undefined) out["aria-describedby"] = accessibilityHint;
  if (accessibilityElementsHidden) out["aria-hidden"] = "true";
  if (accessibilityRole !== undefined) out["role"] = accessibilityRole;
  else if (defaultRole) out["role"] = defaultRole;
  if (accessibilityState !== undefined) {
    const s = accessibilityState as {
      disabled?: boolean;
      selected?: boolean;
      checked?: boolean;
      busy?: boolean;
      expanded?: boolean;
    };
    if (s.disabled !== undefined) out["aria-disabled"] = String(s.disabled);
    if (s.selected !== undefined) out["aria-selected"] = String(s.selected);
    if (s.checked !== undefined) out["aria-checked"] = String(s.checked);
    if (s.busy !== undefined) out["aria-busy"] = String(s.busy);
    if (s.expanded !== undefined) out["aria-expanded"] = String(s.expanded);
  }
  if (accessibilityValue !== undefined) {
    const v = accessibilityValue as {
      now?: number;
      min?: number;
      max?: number;
      text?: string;
    };
    if (v.now !== undefined) out["aria-valuenow"] = v.now;
    if (v.min !== undefined) out["aria-valuemin"] = v.min;
    if (v.max !== undefined) out["aria-valuemax"] = v.max;
    if (v.text !== undefined) out["aria-valuetext"] = v.text;
  }
  if (className !== undefined) out["className"] = className;
  // RN styles aren't CSS; tests read them back with `JSON.parse(el.dataset.style)`.
  if (style !== undefined) out["data-style"] = JSON.stringify(style);
  if (onPress) out["onClick"] = onPress;
  if (onLongPress) out["onContextMenu"] = onLongPress;
  // Accessibility actions: their names as a data attribute, and a custom
  // `accessibilityaction` DOM event (detail: the action's name) that runs the handler.
  const a11yActions = accessibilityActions as { name: string }[] | undefined;
  if (a11yActions?.length) out["data-a11y-actions"] = a11yActions.map((a) => a.name).join(",");
  if (onAccessibilityAction) {
    const handler = onAccessibilityAction as (e: { nativeEvent: { actionName: string } }) => void;
    out["ref"] = (node: HTMLElement | null) => {
      if (!node) return;
      const el = node as HTMLElement & { __a11y?: (e: Event) => void };
      if (el.__a11y) el.removeEventListener("accessibilityaction", el.__a11y);
      el.__a11y = (e: Event) => handler({ nativeEvent: { actionName: String((e as CustomEvent).detail) } });
      el.addEventListener("accessibilityaction", el.__a11y);
    };
  }
  return out;
}

export const View = React.forwardRef<HTMLDivElement, AnyProps>(function View(
  props,
  ref
) {
  const dom = toDom(props);
  return React.createElement("div", { ...dom, ref: ref ?? (dom.ref as React.Ref<HTMLDivElement> | undefined) });
});
View.displayName = "View";

export const SafeAreaView = View;
// A View that also renders its `refreshControl` (as FlatList's mock does), so pull to refresh can be pressed.
export const ScrollView = React.forwardRef<HTMLDivElement, AnyProps>(function ScrollView({ refreshControl, children, ...props }, ref) {
  return React.createElement(View, { ...props, ref }, (refreshControl as React.ReactNode) ?? null, children as React.ReactNode);
});
ScrollView.displayName = "ScrollView";

export const Text = React.forwardRef<HTMLSpanElement, AnyProps>(function Text(
  props,
  ref
) {
  const { numberOfLines, ...rest } = props as AnyProps & {
    numberOfLines?: number;
  };
  void numberOfLines;
  return React.createElement("span", { ...toDom(rest), ref });
});
Text.displayName = "Text";

export const Pressable = React.forwardRef<HTMLButtonElement, AnyProps>(
  function Pressable(props, ref) {
    const { disabled, ...rest } = props as AnyProps & { disabled?: boolean };
    const dom = toDom(rest, "button");
    if (disabled && dom["aria-disabled"] === undefined) {
      dom["aria-disabled"] = "true";
    }
    // Render as button so RTL `getByRole('button')` works.
    return React.createElement("button", {
      type: "button",
      disabled: !!disabled,
      ...dom,
      ref: ref ?? (dom.ref as React.Ref<HTMLButtonElement> | undefined),
    });
  }
);
Pressable.displayName = "Pressable";

export const TouchableOpacity = Pressable;

export const TextInput = React.forwardRef<HTMLInputElement, AnyProps>(
  function TextInput(props, ref) {
    const {
      value,
      defaultValue,
      onChangeText,
      onSubmitEditing,
      placeholder,
      secureTextEntry,
      multiline,
      editable,
      keyboardType,
      autoCapitalize,
      autoCorrect,
      autoFocus,
      maxLength,
      returnKeyType,
      clearButtonMode,
      accessibilityLabel,
      accessibilityHint,
      accessibilityRole,
      testID,
      onFocus,
      onBlur,
      ...rest
    } = props as AnyProps & {
      value?: string;
      defaultValue?: string;
      onChangeText?: (t: string) => void;
      onSubmitEditing?: () => void;
      placeholder?: string;
      secureTextEntry?: boolean;
      multiline?: boolean;
      editable?: boolean;
      keyboardType?: string;
      autoCapitalize?: string;
      autoCorrect?: boolean;
      autoFocus?: boolean;
      maxLength?: number;
      returnKeyType?: string;
      clearButtonMode?: string;
      onFocus?: () => void;
      onBlur?: () => void;
    };
    void rest;
    void keyboardType;
    void autoCapitalize;
    void autoCorrect;
    void returnKeyType;
    void clearButtonMode;

    const Tag = multiline ? "textarea" : "input";
    return React.createElement(Tag, {
      type: secureTextEntry ? "password" : "text",
      value,
      defaultValue,
      placeholder,
      disabled: editable === false,
      autoFocus,
      maxLength,
      "aria-label": accessibilityLabel,
      "aria-describedby": accessibilityHint,
      role: accessibilityRole,
      "data-testid": testID,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChangeText?.(e.target.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") onSubmitEditing?.();
      },
      onFocus,
      onBlur,
      ref,
    });
  }
);
TextInput.displayName = "TextInput";

export const Image = (props: AnyProps) =>
  React.createElement("img", toDom(props));

export const Switch = (props: AnyProps & {
  value?: boolean;
  onValueChange?: (v: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) => {
  const { value, onValueChange, disabled, testID } = props;
  return React.createElement("input", {
    type: "checkbox",
    checked: !!value,
    disabled,
    role: "switch",
    "aria-checked": !!value,
    "data-testid": testID,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onValueChange?.(e.target.checked),
  });
};

export const Modal = ({
  visible,
  children,
  onRequestClose,
  onDismiss,
  testID,
  presentationStyle,
  transparent,
  animationType,
  allowSwipeDismissal,
  statusBarTranslucent,
  navigationBarTranslucent,
}: AnyProps & {
  visible?: boolean;
  onRequestClose?: () => void;
  onDismiss?: () => void;
  presentationStyle?: string;
  transparent?: boolean;
  animationType?: string;
  allowSwipeDismissal?: boolean;
  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
}) => {
  // iOS calls onDismiss once a shown modal has finished hiding; here, right after it hides.
  const wasVisible = React.useRef(false);
  React.useEffect(() => {
    if (wasVisible.current && !visible) onDismiss?.();
    wasVisible.current = !!visible;
  }, [visible]);
  if (!visible) return null;
  return React.createElement(
    "div",
    {
      role: "dialog",
      "data-testid": testID,
      // How the real Modal would be presented, for assertions.
      "data-presentation-style": presentationStyle,
      "data-transparent": transparent ? "true" : undefined,
      "data-animation-type": animationType,
      "data-allow-swipe-dismissal": allowSwipeDismissal ? "true" : undefined,
      "data-status-bar-translucent": statusBarTranslucent ? "true" : undefined,
      "data-navigation-bar-translucent": navigationBarTranslucent ? "true" : undefined,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") onRequestClose?.();
      },
    },
    children
  );
};

export const ActivityIndicator = (props: AnyProps) =>
  React.createElement("span", { ...toDom(props), role: "progressbar" }, null);

export const FlatList = <T,>(props: {
  data?: T[];
  renderItem?: (info: { item: T; index: number }) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  ListHeaderComponent?: React.ReactNode | React.ComponentType;
  ListFooterComponent?: React.ReactNode | React.ComponentType;
  ListEmptyComponent?: React.ReactNode | React.ComponentType;
  refreshControl?: React.ReactNode;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  contentInsetAdjustmentBehavior?: "automatic" | "scrollableAxes" | "never" | "always";
  testID?: string;
}) => {
  const { data = [], renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent, ListEmptyComponent, refreshControl, keyboardShouldPersistTaps, contentInsetAdjustmentBehavior, testID } = props;
  // Slots render like FlatList's: an element as is, a component type as <C />.
  const slot = (s: React.ReactNode | React.ComponentType | undefined) =>
    typeof s === "function" ? React.createElement(s as React.ComponentType) : (s ?? null);
  return React.createElement(
    "div",
    {
      "data-testid": testID,
      role: "list",
      "data-keyboard-should-persist-taps": keyboardShouldPersistTaps,
      "data-content-inset-adjustment-behavior": contentInsetAdjustmentBehavior,
    },
    refreshControl ?? null,
    slot(ListHeaderComponent),
    ...(data.length === 0
      ? [slot(ListEmptyComponent)]
      : data.map((item, index) =>
          React.createElement(
            "div",
            { key: keyExtractor ? keyExtractor(item, index) : String(index) },
            renderItem?.({ item, index })
          )
        )),
    slot(ListFooterComponent)
  );
};

export const SectionList = <T,>(props: {
  sections?: { title: string; data: T[] }[];
  renderItem?: (info: { item: T; index: number; section: { title: string; data: T[] } }) => React.ReactNode;
  renderSectionHeader?: (info: { section: { title: string; data: T[] } }) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  stickySectionHeadersEnabled?: boolean;
  ListHeaderComponent?: React.ReactNode | React.ComponentType;
  ListFooterComponent?: React.ReactNode | React.ComponentType;
  ListEmptyComponent?: React.ReactNode | React.ComponentType;
  refreshControl?: React.ReactNode;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onEndReached?: () => void;
  maintainVisibleContentPosition?: { minIndexForVisible: number } | null;
  testID?: string;
}) => {
  const { sections = [], renderItem, renderSectionHeader, keyExtractor, stickySectionHeadersEnabled, ListHeaderComponent, ListFooterComponent, ListEmptyComponent, refreshControl, onStartReached, onEndReached, maintainVisibleContentPosition, testID } = props;
  // Slots render like FlatList's: an element as is, a component type as <C />.
  const slot = (s: React.ReactNode | React.ComponentType | undefined) =>
    typeof s === "function" ? React.createElement(s as React.ComponentType) : (s ?? null);
  const empty = sections.every((section) => section.data.length === 0);
  return React.createElement(
    "div",
    {
      "data-testid": testID,
      role: "list",
      "data-sticky-section-headers": stickySectionHeadersEnabled === undefined ? undefined : String(stickySectionHeadersEnabled),
      "data-maintain-visible-content-position": maintainVisibleContentPosition ? JSON.stringify(maintainVisibleContentPosition) : undefined,
      // Scrolling stands in as custom events: `startreached` and `endreached` call the handlers.
      ref: (node: HTMLElement | null) => {
        if (!node) return;
        const el = node as HTMLElement & { __start?: () => void; __end?: () => void };
        if (el.__start) el.removeEventListener("startreached", el.__start);
        if (el.__end) el.removeEventListener("endreached", el.__end);
        el.__start = () => onStartReached?.({ distanceFromStart: 0 });
        el.__end = () => onEndReached?.();
        el.addEventListener("startreached", el.__start);
        el.addEventListener("endreached", el.__end);
      },
    },
    refreshControl ?? null,
    slot(ListHeaderComponent),
    ...(empty
      ? [slot(ListEmptyComponent)]
      : sections.flatMap((section, si) => [
          React.createElement(
            "div",
            { key: `header-${si}` },
            renderSectionHeader?.({ section })
          ),
          ...section.data.map((item, ii) =>
            React.createElement(
              "div",
              {
                key: keyExtractor ? keyExtractor(item, ii) : `${si}-${ii}`,
              },
              renderItem?.({ item, index: ii, section })
            )
          ),
        ])),
    slot(ListFooterComponent)
  );
};

export const Platform = {
  OS: "ios" as "ios" | "android" | "web",
  Version: "18.0" as number | string,
  select<T>(specifics: { ios?: T; android?: T; web?: T; default?: T }): T {
    return (specifics.ios ?? specifics.default) as T;
  },
};

class AnimatedValue {
  private current: number;
  constructor(value: number) {
    this.current = value;
  }
  setValue(v: number) {
    this.current = v;
  }
  interpolate(_config: unknown) {
    return this.current;
  }
}

const animatedRunner = () => ({
  start(cb?: () => void) {
    cb?.();
  },
});

export const Animated = {
  View,
  Text,
  Value: AnimatedValue as unknown as new (v: number) => AnimatedValue,
  timing: () => animatedRunner(),
  parallel: () => animatedRunner(),
  sequence: () => animatedRunner(),
  spring: () => animatedRunner(),
  decay: () => animatedRunner(),
  loop: () => ({ start: () => {}, stop: () => {} }),
};

export const Easing = {
  linear: () => 0,
  ease: () => 0,
  inOut: (e: unknown) => e,
};

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: () => ({ remove: () => {} }),
};

const appStateListeners = new Set<(state: string) => void>();
/** AppState: "active"; a test moves the app with `AppState.__emit("background")`. */
export const AppState = {
  currentState: "active" as string,
  addEventListener: (_event: string, listener: (state: string) => void) => {
    appStateListeners.add(listener);
    return { remove: () => void appStateListeners.delete(listener) };
  },
  __emit(state: string) {
    AppState.currentState = state;
    appStateListeners.forEach((l) => l(state));
  },
};

export const Dimensions = {
  get: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
  addEventListener: () => ({ remove: () => {} }),
};

export const PanResponder = {
  create: () => ({ panHandlers: {} }),
};

export const RefreshControl = (props: AnyProps) => {
  const { testID, tintColor, refreshing, onRefresh } = props as AnyProps & { testID?: string; tintColor?: unknown; refreshing?: boolean; onRefresh?: () => void };
  // A click stands in for the pull.
  return React.createElement("div", {
    "data-testid": testID,
    "data-tint-color": tintColor === undefined ? undefined : typeof tintColor === "string" ? tintColor : JSON.stringify(tintColor),
    "data-refreshing": refreshing === undefined ? undefined : String(refreshing),
    onClick: onRefresh,
  });
};

export const StatusBar = (_props: AnyProps) => null;

export const StyleSheet = {
  hairlineWidth: 0.5,
  create<T>(styles: T): T {
    return styles;
  },
  flatten(style: unknown): Record<string, unknown> {
    if (Array.isArray(style)) return Object.assign({}, ...style.map((s) => StyleSheet.flatten(s)));
    return (style as Record<string, unknown>) ?? {};
  },
};

/** Records the names, like the real one does in its opaque value. */
export function PlatformColor(...names: string[]) {
  return { semantic: names };
}

export const Appearance = {
  getColorScheme(): "light" | "dark" | null {
    return "light";
  },
  addChangeListener(_cb: (e: { colorScheme: "light" | "dark" | null }) => void) {
    return { remove: () => {} };
  },
};

export const KeyboardAvoidingView = (props: AnyProps) =>
  React.createElement("div", { ...toDom(props) });

export const Linking = {
  openURL: _vi.fn(async (_url: string) => {}),
  canOpenURL: _vi.fn(async (_url: string) => true),
};

// Mockable Alert.alert — tests assert via `Alert.alert.mock.calls` and
// trigger button onPress by invoking the captured handler.
import { vi as _vi } from "vitest";
type AlertButton = { text: string; onPress?: () => void; style?: string };
export const Alert = {
  alert: _vi.fn<
    (title: string, message?: string, buttons?: AlertButton[]) => void
  >(),
};

export default {};
