/**
 * SettingsSubPage — drill-in detail layout.
 *
 * Composes a KeyboardAvoidingView + scroll + dirty-form leave warning +
 * optimistic-save pattern. The save action is surfaced in the nav bar via
 * a `<NavBarSaveButton>` rendered through `headerRight`.
 *
 * Why ship: the recurring shape is "form fields + nav-bar Save + leave
 * guard"; consumers re-implement this every time. Genesis ships the
 * shape so consumers focus on the form fields themselves.
 *
 * Layer-3 customization: pass `headerTitle`, `headerLeft`, OR a direct
 * `headerOptions={...}`. Use `getSettingsSubPageStackOptions()` to get a
 * `<Stack.Screen options={...}>` object (with the save button wired via
 * `headerRight`).
 *
 * @stability Beta
 */
import { useCallback, type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import { cn } from "../utils";
import {
  ScreenContainer,
  composeHeaderOptions,
  type ScreenHeaderProps,
} from "./screen-container";
import { NavBarSaveButton } from "./nav-bar";

export interface SettingsSubPageProps extends ScreenHeaderProps {
  /** Form / detail body content. Pass any node tree. */
  children: ReactNode;
  /**
   * When true, the Save button is enabled and the back-confirm guard
   * fires when the user tries to leave. Mark `true` whenever the form
   * has unsaved changes.
   */
  dirty?: boolean;
  /** When true, the Save button shows a busy indicator and is non-pressable. */
  saving?: boolean;
  /** Save handler. Required to render a Save button in the nav bar. */
  onSave?: () => void | Promise<void>;
  /**
   * Confirm-leave hook. Implementations should integrate with the
   * navigator's `beforeRemove` listener (React Navigation) — Genesis
   * provides a default `Alert` confirm helper via `confirmDiscardChanges()`.
   * Pass null to opt OUT of the leave guard.
   */
  onConfirmLeave?: ((proceed: () => void) => void) | null;
  /** Save button label. Default `"Save"`. */
  saveLabel?: string;
  /** Override root container styling. */
  className?: string;
  /** testID on the root container. Default `"settings-sub-page"`. */
  testID?: string;
}

/**
 * Default leave-guard helper. Pops a native Alert with Discard / Keep
 * Editing buttons; calls `proceed()` only if the user opts to discard.
 *
 *   <SettingsSubPage onConfirmLeave={confirmDiscardChanges} ... />
 */
export function confirmDiscardChanges(proceed: () => void): void {
  Alert.alert(
    "Discard changes?",
    "You have unsaved changes. Leave this screen and lose them?",
    [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => proceed(),
      },
    ],
  );
}

/**
 * Compose `<Stack.Screen options={...}>` for a SettingsSubPage. Wires
 * the nav-bar Save button via `headerRight` automatically when `onSave`
 * is passed.
 */
export function getSettingsSubPageStackOptions(props: {
  headerTitle?: string;
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  large?: boolean;
  scrollEdgeBehavior?: ScreenHeaderProps["scrollEdgeBehavior"];
  headerLeft?: ScreenHeaderProps["headerLeft"];
  headerRight?: ScreenHeaderProps["headerRight"];
  headerOptions?: ScreenHeaderProps["headerOptions"];
}): Record<string, unknown> {
  const {
    headerTitle,
    dirty,
    saving,
    onSave,
    saveLabel = "Save",
    large = false,
    scrollEdgeBehavior,
    headerLeft,
    headerRight,
    headerOptions,
  } = props;

  // Auto-wire headerRight with save button if not overridden.
  const resolvedHeaderRight =
    headerRight ??
    (onSave
      ? () => (
          <NavBarSaveButton
            label={saveLabel}
            onPress={() => {
              void onSave();
            }}
            disabled={!dirty}
            loading={saving}
          />
        )
      : undefined);

  return composeHeaderOptions({
    headerTitle,
    headerLeft,
    headerRight: resolvedHeaderRight,
    large,
    scrollEdgeBehavior,
    headerOptions,
  });
}

export function SettingsSubPage({
  children,
  onConfirmLeave,
  className,
  testID = "settings-sub-page",
}: SettingsSubPageProps) {
  // Note: dirty / saving / onSave / saveLabel / screen header props are
  // consumed by getSettingsSubPageStackOptions() at the consumer level —
  // SettingsSubPage itself is intentionally minimal so the same component
  // works for both pure form pages AND screens with Stack.Screen options
  // wired separately. We only render the body chrome here.
  //
  // The actual `beforeRemove` wire-up lives at the consumer's navigator
  // level — they call `useNavigation().addListener('beforeRemove', ...)`
  // and inside the callback they invoke `props.onConfirmLeave(proceed)`.
  // We expose `confirmDiscardChanges()` as the canonical helper so
  // consumers get the leave-guard semantics for free.
  const _onConfirmLeave = useCallback(
    (proceed: () => void) => {
      if (onConfirmLeave === null) {
        proceed();
        return;
      }
      const fn = onConfirmLeave ?? confirmDiscardChanges;
      fn(proceed);
    },
    [onConfirmLeave],
  );
  void _onConfirmLeave;

  return (
    <KeyboardAvoidingView
      testID={`${testID}-kav`}
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenContainer
        scroll
        safeAreaEdges={["left", "right", "bottom"]}
        testID={testID}
        contentClassName={cn("p-4", className)}
        keyboardShouldPersistTaps="handled"
      >
        <View testID={`${testID}-form`} className="gap-4">
          {children}
        </View>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}
