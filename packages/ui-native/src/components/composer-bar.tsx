/**
 * NativeComposerBar — the bar you write a message in: an input that grows
 * with what you type (up to `maxLines`, then scrolls), a send button, and
 * slots beside and above it. ThreadPage's composer; chat, comments and AI
 * prompts build on it too.
 *
 * - **Modes:** `modes` with a `tone` each ("Reply" / "Internal note"). The
 *   picker sits above the input, and an `internal` tone edges the bar and
 *   the input in the theme's `warning` role, so a staff-only note never
 *   reads like a reply (the send button keeps the tint: text on `warning`
 *   would fail contrast). The row it sends carries the same tone (ThreadPage).
 * - **Slots:** `leading` (attach), `trailing` (beside send: an emoji button),
 *   `above` (a reply preview, attachments waiting to send), `idleAction` (in
 *   Send's place while there's nothing to send: a hold-to-record mic) and
 *   `replaceInput` (instead of `leading` and the input: a recording's
 *   waveform). Attachments with no text: pass `hasContent`.
 * - **More ways to send:** `sendActions` ("Schedule"). Touch and hold Send:
 *   one action runs, several open a menu. Each is also an accessibility
 *   action on Send.
 * - **Keyboard:** the bar doesn't move itself. Put it under a keyboard-aware
 *   container (ThreadPage does, with `GenesisModules.keyboardAvoidingView`);
 *   the list above it dismisses the keyboard interactively on a drag.
 * - **Accessibility:** send and the mode picker are 44pt targets, the input
 *   is labelled by its placeholder (and says when it writes an internal
 *   note), Sending is announced, and the input stays editable while a
 *   message sends (the keyboard stays up).
 *
 * @stability Beta
 */
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Dimensions, Platform, Pressable, TextInput, View } from "react-native";
import type { ComposerMode } from "@marktiderman/genesis-core/conversation";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useGenesisModules } from "../native-modules";
import { usePressFeedback } from "../hooks/use-press-feedback";
import { NativeContextMenu } from "./context-menu";
import { NativeIcon } from "./icon";
import { NativeText } from "./text";

export type { ComposerMode, ComposerTone } from "@marktiderman/genesis-core/conversation";

export interface NativeComposerBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** A send is in flight: the button spins and won't send twice. */
  sending?: boolean;
  /** Turns sending off (besides a blank value). */
  disabled?: boolean;
  placeholder?: string;
  /** Send's label, to VoiceOver. Default "Send". */
  sendLabel?: string;
  sendingLabel?: string;
  maxLength?: number;
  /** The input grows to this many lines, then scrolls. Default 6. */
  maxLines?: number;
  /** Ways to send ("Reply", "Internal note"). Two or more show the picker. */
  modes?: readonly ComposerMode[];
  /** The picker's name, to VoiceOver. Default "Send as". */
  modesLabel?: string;
  /** The chosen mode's id. Default the first. */
  mode?: string;
  onModeChange?: (id: string) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  above?: ReactNode;
  /**
   * Whether there's something to send. By default, a `value` that isn't blank; pass `true` when
   * attachments are waiting and no text is needed, and `false` while `replaceInput` is showing.
   */
  hasContent?: boolean;
  /** Takes Send's place (the same 44pt spot) while there's nothing to send and nothing sending: a hold-to-record mic. */
  idleAction?: ReactNode;
  /** Shown instead of `leading` and the input (a recording in progress). Label it yourself: it's one region to VoiceOver. */
  replaceInput?: ReactNode;
  /** Touch and hold Send for these (one runs straight away; several open a menu). Each is also an accessibility action on Send. */
  sendActions?: readonly ComposerSendAction[];
  /** Title of the menu when there are several `sendActions`. */
  sendActionsTitle?: string;
  /** The hint on Send when it has `sendActions`. Default "Touch and hold for more options". */
  sendActionsHint?: string;
  /** Passed to the input (to insert at the cursor, say). */
  onSelectionChange?: (e: { nativeEvent: { selection: { start: number; end: number } } }) => void;
  /**
   * The input takes text (default). When false, Send is off and the input reads as disabled.
   * `idleAction` is the app's, so disable it too.
   */
  editable?: boolean;
  testID?: string;
}

/** Another way to send (touch and hold Send). */
export interface ComposerSendAction {
  id: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

const LINE = 22;
const PAD_Y = 8;

export function NativeComposerBar({
  value,
  onChangeText,
  onSend,
  sending = false,
  disabled = false,
  placeholder = "Message",
  sendLabel = "Send",
  sendingLabel = "Sending",
  maxLength,
  maxLines = 6,
  modes,
  modesLabel = "Send as",
  mode,
  onModeChange,
  leading,
  trailing,
  above,
  hasContent,
  idleAction,
  replaceInput,
  sendActions,
  sendActionsTitle,
  sendActionsHint = "Touch and hold for more options",
  onSelectionChange,
  editable = true,
  testID = "composer",
}: NativeComposerBarProps) {
  const colors = useThemeRoles();
  const { symbol, icons } = useGenesisModules();
  // No icon module: the arrow would draw nothing, so the button says its label.
  const hasIcon = Boolean(symbol || icons?.["arrow-up"]);
  const current = modes?.find((m) => m.id === mode) ?? modes?.[0];
  const internal = current?.tone === "internal";
  const blank = !(hasContent ?? value.trim().length > 0);
  const canSend = !blank && !disabled && !sending && editable;
  const actions = sendActions?.length ? sendActions : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const idle = idleAction != null && blank && !sending;
  const sendPress = usePressFeedback({ haptic: "light", scale: 0.9, disabled: !canSend });
  // A multiline input grows with its text by itself; this caps it, after which it scrolls.
  // Lines grow with the person's text size (Dynamic Type, Android font scale).
  const fontScale = Dimensions.get("window").fontScale || 1;
  const maxHeight = Math.ceil(LINE * fontScale) * maxLines + PAD_Y * 2;
  // Say "Sending" on iOS too (a live region is Android-only).
  useEffect(() => {
    if (sending && Platform.OS === "ios") (AccessibilityInfo as { announceForAccessibility?: (t: string) => void }).announceForAccessibility?.(sendingLabel);
  }, [sending, sendingLabel]);

  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 6,
        backgroundColor: colors.groupedBackground,
        borderTopWidth: internal ? 2 : 0,
        borderTopColor: colors.warning,
      }}
    >
      {modes && modes.length > 1 ? (
        <View testID={`${testID}-modes`} accessibilityRole="tablist" accessibilityLabel={modesLabel} style={{ flexDirection: "row", gap: 4 }}>
          {modes.map((m) => {
            const on = m.id === current?.id;
            return (
              <Pressable
                key={m.id}
                testID={`${testID}-mode-${m.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={m.label}
                onPress={() => onModeChange?.(m.id)}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: 12,
                  borderRadius: 22,
                  backgroundColor: on ? colors.fill : "transparent",
                  borderWidth: m.tone === "internal" ? 1 : 0,
                  borderColor: colors.warning,
                }}
              >
                <NativeText preset="label" style={{ color: on ? colors.label : colors.secondaryLabel }}>
                  {m.label}
                </NativeText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {above}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {replaceInput != null ? (
          <View style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>{replaceInput}</View>
        ) : (
          <>
        {leading}
        <TextInput
          testID={`${testID}-input`}
          value={value}
          onChangeText={onChangeText}
          placeholder={internal ? current!.label : placeholder}
          placeholderTextColor={colors.tertiaryLabel as string}
          accessibilityLabel={internal ? current!.label : placeholder}
          accessibilityState={editable ? undefined : { disabled: true }}
          editable={editable}
          onSelectionChange={onSelectionChange}
          multiline
          maxLength={maxLength}
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight,
            textAlignVertical: "center",
            paddingHorizontal: 14,
            paddingTop: PAD_Y,
            paddingBottom: PAD_Y,
            borderRadius: 22,
            fontSize: 17,
            lineHeight: LINE,
            color: colors.label as string,
            backgroundColor: colors.surface,
            borderWidth: internal ? 1 : 0,
            borderColor: colors.warning,
            opacity: editable ? 1 : 0.6,
          }}
        />
          </>
        )}
        {trailing}
        {idle ? (
          <View testID={`${testID}-idle`} style={{ minWidth: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            {idleAction}
          </View>
        ) : sending ? (
          <View testID={`${testID}-sending`} accessible accessibilityLabel={sendingLabel} accessibilityLiveRegion="polite" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator />
          </View>
        ) : (
          <Animated.View style={sendPress.style}>
            <Pressable
              testID={`${testID}-send`}
              accessibilityRole="button"
              accessibilityLabel={sendLabel}
              accessibilityState={{ disabled: !canSend }}
              accessibilityHint={actions ? sendActionsHint : undefined}
              accessibilityActions={actions && canSend ? actions.map((a) => ({ name: a.id, label: a.label })) : undefined}
              onAccessibilityAction={actions ? (e) => actions.find((a) => a.id === e.nativeEvent.actionName)?.onPress() : undefined}
              onLongPress={actions ? () => (actions.length === 1 ? actions[0]!.onPress() : setMenuOpen(true)) : undefined}
              disabled={!canSend}
              onPressIn={sendPress.onPressIn}
              onPressOut={sendPress.onPressOut}
              onPress={() => {
                sendPress.confirm();
                onSend();
              }}
              style={{ minWidth: 44, height: 44, paddingHorizontal: hasIcon ? 0 : 14, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: canSend ? colors.tint : colors.fill }}
            >
              {hasIcon ? (
                <NativeIcon name="arrow-up" size={20} color={canSend ? colors.background : colors.tertiaryLabel} />
              ) : (
                <NativeText preset="label" className={canSend ? "text-primary-foreground" : undefined} style={canSend ? undefined : { color: colors.tertiaryLabel }}>
                  {sendLabel}
                </NativeText>
              )}
            </Pressable>
          </Animated.View>
        )}
      </View>
      {actions && actions.length > 1 ? <NativeContextMenu open={menuOpen} onOpenChange={setMenuOpen} actions={actions} {...(sendActionsTitle ? { title: sendActionsTitle } : {})} testID={`${testID}-send-menu`} /> : null}
    </View>
  );
}
