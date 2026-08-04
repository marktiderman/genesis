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
  void pointerEvents;
  void hitSlop;
  void collapsable;
  void style;
  void importantForAccessibility;
  void accessibilityElementsHidden;
  void accessibilityViewIsModal;
  void accessibilityLiveRegion;

  const out: Record<string, unknown> = { ...rest, children };
  if (testID !== undefined) out["data-testid"] = testID;
  if (accessibilityLabel !== undefined) out["aria-label"] = accessibilityLabel;
  if (accessibilityHint !== undefined) out["aria-describedby"] = accessibilityHint;
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
  if (onPress) out["onClick"] = onPress;
  if (onLongPress) out["onContextMenu"] = onLongPress;
  return out;
}

export const View = React.forwardRef<HTMLDivElement, AnyProps>(function View(
  props,
  ref
) {
  return React.createElement("div", { ...toDom(props), ref });
});
View.displayName = "View";

export const SafeAreaView = View;
export const ScrollView = View;

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
      ref,
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
  testID,
}: AnyProps & { visible?: boolean; onRequestClose?: () => void }) => {
  if (!visible) return null;
  return React.createElement(
    "div",
    {
      role: "dialog",
      "data-testid": testID,
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
  testID?: string;
}) => {
  const { data = [], renderItem, keyExtractor, testID } = props;
  return React.createElement(
    "div",
    { "data-testid": testID, role: "list" },
    data.map((item, index) =>
      React.createElement(
        "div",
        { key: keyExtractor ? keyExtractor(item, index) : String(index) },
        renderItem?.({ item, index })
      )
    )
  );
};

export const SectionList = <T,>(props: {
  sections?: { title: string; data: T[] }[];
  renderItem?: (info: { item: T; index: number; section: { title: string } }) => React.ReactNode;
  renderSectionHeader?: (info: { section: { title: string; data: T[] } }) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  testID?: string;
}) => {
  const { sections = [], renderItem, renderSectionHeader, keyExtractor, testID } = props;
  return React.createElement(
    "div",
    { "data-testid": testID, role: "list" },
    sections.flatMap((section, si) => [
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
    ])
  );
};

export const Platform = {
  OS: "ios" as "ios" | "android" | "web",
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

export const Dimensions = {
  get: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
  addEventListener: () => ({ remove: () => {} }),
};

export const PanResponder = {
  create: () => ({ panHandlers: {} }),
};

export const RefreshControl = (props: AnyProps) =>
  React.createElement("div", { "data-testid": (props as AnyProps).testID });

export const StatusBar = (_props: AnyProps) => null;

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
