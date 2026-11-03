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
 * - **Slots:** `leading` (attach), `trailing` (beside send: a mic), `above`
 *   (a reply preview, attachments waiting to send).
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
import { useEffect, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, Dimensions, Platform, Pressable, TextInput, View } from "react-native";
import type { ComposerMode } from "@marktiderman/genesis-core/conversation";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useGenesisModules } from "../native-modules";
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
  /** The chosen mode's id. Default the first. */
  mode?: string;
  onModeChange?: (id: string) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  above?: ReactNode;
  testID?: string;
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
  mode,
  onModeChange,
  leading,
  trailing,
  above,
  testID = "composer",
}: NativeComposerBarProps) {
  const colors = useThemeRoles();
  const { symbol, icons } = useGenesisModules();
  // No icon module: the arrow would draw nothing, so the button says its label.
  const hasIcon = Boolean(symbol || icons?.["arrow-up"]);
  const current = modes?.find((m) => m.id === mode) ?? modes?.[0];
  const internal = current?.tone === "internal";
  const blank = !value.trim();
  const canSend = !blank && !disabled && !sending;
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
        <View testID={`${testID}-modes`} accessibilityRole="tablist" style={{ flexDirection: "row", gap: 4 }}>
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
        {leading}
        <TextInput
          testID={`${testID}-input`}
          value={value}
          onChangeText={onChangeText}
          placeholder={internal ? current!.label : placeholder}
          placeholderTextColor={colors.tertiaryLabel as string}
          accessibilityLabel={internal ? current!.label : placeholder}
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
          }}
        />
        {trailing}
        {sending ? (
          <View testID={`${testID}-sending`} accessible accessibilityLabel={sendingLabel} accessibilityLiveRegion="polite" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator />
          </View>
        ) : (
          <Pressable
            testID={`${testID}-send`}
            accessibilityRole="button"
            accessibilityLabel={sendLabel}
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={onSend}
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
        )}
      </View>
    </View>
  );
}
