/**
 * NativeComposerBar — the bar you write a message in: an input that grows
 * with what you type (up to `maxLines`, then scrolls), a send button, and
 * slots beside and above it. ThreadPage's composer; chat, comments and AI
 * prompts build on it too.
 *
 * - **Modes:** `modes` with a `tone` each ("Reply" / "Internal note"). The
 *   picker sits above the input, and an `internal` tone tints the whole bar
 *   in the theme's `warning` role, so a staff-only note never reads like a
 *   reply. The row it sends carries the same tone (ThreadPage).
 * - **Slots:** `leading` (attach), `trailing` (beside send: a mic), `above`
 *   (a reply preview, attachments waiting to send).
 * - **Keyboard:** the bar doesn't move itself. Put it under a keyboard-aware
 *   container (ThreadPage does, with `GenesisModules.keyboardAvoidingView`);
 *   the list above it dismisses the keyboard interactively on a drag.
 * - **Accessibility:** send and the mode picker are 44pt targets, the input
 *   is labelled by its placeholder, and Sending is announced.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useGenesisModules } from "../native-modules";
import { NativeIcon } from "./icon";
import { NativeText } from "./text";

/** How a mode reads: `default`, or `internal` (staff only: tinted, never mistaken for a reply). */
export type ComposerTone = "default" | "internal";

export interface ComposerMode {
  id: string;
  label: string;
  tone?: ComposerTone;
}

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
  const maxHeight = LINE * maxLines + PAD_Y * 2;
  const accent = internal ? colors.warning : colors.tint;

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
                style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 22, backgroundColor: on ? colors.fill : "transparent" }}
              >
                <NativeText preset="label" style={{ color: on ? (m.tone === "internal" ? colors.warning : colors.label) : colors.secondaryLabel }}>
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
          placeholder={current?.tone === "internal" ? current.label : placeholder}
          placeholderTextColor={colors.tertiaryLabel as string}
          accessibilityLabel={current?.tone === "internal" ? current.label : placeholder}
          multiline
          maxLength={maxLength}
          editable={!sending}
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight,
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
            style={{ minWidth: 44, height: 44, paddingHorizontal: hasIcon ? 0 : 14, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: canSend ? accent : colors.fill }}
          >
            {hasIcon ? (
              <NativeIcon name="arrow-up" size={20} color={canSend ? colors.background : colors.tertiaryLabel} />
            ) : (
              <NativeText preset="label" style={{ color: canSend ? colors.background : colors.tertiaryLabel }}>
                {sendLabel}
              </NativeText>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
