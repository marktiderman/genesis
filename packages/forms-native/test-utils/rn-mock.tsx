// genesis-ui-native's react-native shim, plus the few APIs a form uses that it lacks: spoken
// announcements and accessibility focus (recorded, so tests can read them), Keyboard and
// AppState (whose listeners tests can call), and a TextInput that keeps its ref focusable and
// passes accessibility state through.
import * as React from "react";
import { vi } from "vitest";

export * from "../../ui-native/test-utils/rn-mock";
import { AccessibilityInfo as BaseAccessibilityInfo, Pressable as BasePressable } from "../../ui-native/test-utils/rn-mock";

export const announcements: string[] = [];
export const focused: unknown[] = [];

export const AccessibilityInfo = {
  ...BaseAccessibilityInfo,
  announceForAccessibility: vi.fn<(message: string) => void>((message: string) => {
    announcements.push(message);
  }),
  sendAccessibilityEvent: vi.fn<(node: unknown, event: string) => void>((node: unknown, event: string) => {
    if (event === "focus") focused.push(node);
  }),
  setAccessibilityFocus: vi.fn<(node: unknown) => void>(),
};

export const Keyboard = { dismiss: vi.fn<() => void>() };

/** Drawn in place, so tests can find the bar above a keyboard. */
export const InputAccessoryView = ({ nativeID, children }: { nativeID?: string; children?: React.ReactNode }) =>
  React.createElement("div", { "data-accessory": nativeID }, children);

type AppStateListener = (state: string) => void;
export const appStateListeners = new Set<AppStateListener>();
export const AppState = {
  currentState: "active",
  addEventListener: (_type: string, listener: AppStateListener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  },
};

type InputProps = {
  value?: string;
  onChangeText?: (t: string) => void;
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  multiline?: boolean;
  editable?: boolean;
  maxLength?: number;
  placeholder?: string;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: string;
  accessibilityState?: { disabled?: boolean };
  keyboardType?: string;
  returnKeyType?: string;
  inputAccessoryViewID?: string;
  textContentType?: string;
  autoComplete?: string;
};

export const TextInput = React.forwardRef<HTMLInputElement, InputProps>(function TextInput(props, ref) {
  const Tag = props.multiline ? "textarea" : "input";
  return React.createElement(Tag, {
    ref,
    type: "text",
    value: props.value,
    placeholder: props.placeholder,
    maxLength: props.maxLength,
    disabled: props.editable === false,
    role: props.accessibilityRole,
    "aria-label": props.accessibilityLabel,
    "aria-describedby": props.accessibilityHint,
    "data-testid": props.testID,
    "data-keyboard": props.keyboardType,
    "data-return-key": props.returnKeyType,
    "data-accessory-id": props.inputAccessoryViewID,
    "data-content-type": props.textContentType,
    "data-autocomplete": props.autoComplete,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => props.onChangeText?.(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !props.multiline) props.onSubmitEditing?.();
    },
    onFocus: props.onFocus,
    onBlur: props.onBlur,
  });
});

/** Pressable's `style` may be a function of `{ pressed }`; the shim only needs it not to throw. */
export const Pressable = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(function Pressable(props, ref) {
  const { style, children, ...rest } = props as { style?: unknown; children?: unknown };
  const resolved = typeof style === "function" ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  const content = typeof children === "function" ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false }) : children;
  const Base = BasePressable as unknown as React.ComponentType<Record<string, unknown>>;
  return React.createElement(Base, { ...rest, style: resolved, ref }, content as React.ReactNode);
});
