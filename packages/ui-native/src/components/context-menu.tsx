/**
 * NativeContextMenu — what a long press opens: a short list of actions in a
 * sheet that fits them, with Cancel, instead of the system `Alert`. It's the
 * same on iOS and Android, a row of its own for each action (44pt, a destructive
 * one in the theme's `destructive`), and opening it taps `medium`.
 *
 * Controlled, like `NativeSheet`: keep `open` in your screen and set it from
 * `onLongPress`. Offer the same actions as accessibility actions on the
 * pressable too (`accessibilityActions`), since VoiceOver doesn't long press.
 *
 * An action runs once, and once the sheet has gone: iOS won't present an alert
 * or another modal over one that's still dismissing.
 *
 * @stability Beta
 */
import { useEffect, useRef } from "react";
import { Platform, Pressable, View } from "react-native";
import { useHaptics } from "../hooks/use-haptics";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { NativeSheet } from "./sheet";
import { NativeText } from "./text";

export interface NativeContextMenuAction {
  id: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface NativeContextMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: readonly NativeContextMenuAction[];
  /** Over the actions: what they act on. */
  title?: string;
  cancelLabel?: string;
  testID?: string;
}

/** If iOS never says the sheet has gone (Modal's `onDismiss` can be skipped), run the action after this. */
const IOS_DISMISS_FALLBACK_MS = 600;

export function NativeContextMenu({ open, onOpenChange, actions, title, cancelLabel = "Cancel", testID = "context-menu" }: NativeContextMenuProps) {
  const colors = useThemeRoles();
  const play = useHaptics();
  const opened = useRef(false);
  // What was tapped, until the sheet has gone. Taken once: a second tap, or the fallback after onDismiss, finds nothing.
  const tapped = useRef<(() => void) | null>(null);
  const ran = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (open && !opened.current) {
      play("medium");
      ran.current = false;
    }
    opened.current = open;
  }, [open, play]);

  const runTapped = () => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    const action = tapped.current;
    tapped.current = null;
    action?.();
  };
  const run = (action: NativeContextMenuAction) => {
    if (ran.current) return;
    ran.current = true;
    tapped.current = action.onPress;
    onOpenChange(false);
    if (Platform.OS === "ios") fallback.current = setTimeout(runTapped, IOS_DISMISS_FALLBACK_MS);
    else runTapped();
  };

  return (
    <NativeSheet open={open} onOpenChange={onOpenChange} fitContent onDismissed={runTapped} testID={testID}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        {title ? (
          <NativeText testID={`${testID}-title`} accessibilityRole="header" numberOfLines={2} style={{ paddingVertical: 8, color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, textAlign: "center" }}>
            {title}
          </NativeText>
        ) : null}
        {actions.map((action) => (
          <Pressable
            key={action.id}
            testID={`${testID}-action-${action.id}`}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => run(action)}
            style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
          >
            <NativeText style={{ color: action.destructive ? colors.destructive : colors.tint, fontSize: 17, lineHeight: 22 }}>{action.label}</NativeText>
          </Pressable>
        ))}
        <Pressable testID={`${testID}-cancel`} accessibilityRole="button" accessibilityLabel={cancelLabel} onPress={() => onOpenChange(false)} style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
          <NativeText style={{ color: colors.label, fontSize: 17, lineHeight: 22, fontWeight: "600" }}>{cancelLabel}</NativeText>
        </Pressable>
      </View>
    </NativeSheet>
  );
}
