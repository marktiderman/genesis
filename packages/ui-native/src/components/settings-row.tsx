/**
 * SettingsRow — a label and a description with a control at the end: the twin of genesis-ui's
 * SettingsRow. It is a NativeListItem (the phone's row), with the control in its trailing slot.
 *
 * ToggleRow — a SettingsRow with a switch: the twin of genesis-ui's ToggleRow. The whole row
 * flips the switch and is one `switch` to a screen reader (its label, description and state), as
 * the iOS Settings app's rows are.
 *
 * ResourceSettingsPage — every setting of one thing (a form, a course) as cards with icons, and a
 * row of jump links that scroll to each: the twin of genesis-ui's ResourceSettingsPage. Its
 * sections take the same `id`, `title`, `icon`, `description` and `content`.
 *
 * @stability Beta
 */
import { useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { NativeCard } from "./card";
import { NativeListItem, NativeListItemDivider } from "./list-item";
import { NativeSwitch } from "./switch";
import { cn } from "../utils";

export interface NativeSettingsRowProps {
  label: string;
  description?: string;
  /** The control at the end: a NativeSwitch, a NativeSelect trigger, a NativeBadge, a NativeButton. */
  children?: ReactNode;
  /** Makes the row a button (a row that opens a sub-page). */
  onPress?: () => void;
  /** The drill-in chevron, for a row that opens a sub-page. */
  showChevron?: boolean;
  disabled?: boolean;
  className?: string;
  testID?: string;
}

export function NativeSettingsRow({ label, description, children, onPress, showChevron, disabled, className, testID = "settings-row" }: NativeSettingsRowProps) {
  return (
    <NativeListItem
      title={label}
      subtitle={description}
      trailing={children}
      onPress={onPress}
      showChevron={showChevron}
      disabled={disabled}
      className={cn(disabled && !onPress && "opacity-50", className)}
      testID={testID}
    />
  );
}

export interface NativeToggleRowProps {
  label: string;
  description?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  /** On the switch, as on the web. */
  testID?: string;
  rowTestID?: string;
}

export function NativeToggleRow({ label, description, checked: checkedProp, defaultChecked = false, onCheckedChange, disabled, className, testID = "toggle-row-switch", rowTestID = "toggle-row" }: NativeToggleRowProps) {
  const [checkedState, setCheckedState] = useState(defaultChecked);
  const checked = checkedProp ?? checkedState;
  const set = (next: boolean) => {
    if (disabled) return;
    if (checkedProp === undefined) setCheckedState(next);
    onCheckedChange?.(next);
  };
  return (
    <NativeListItem
      title={label}
      subtitle={description}
      onPress={() => set(!checked)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      className={className}
      testID={rowTestID}
      trailing={
        // The row is the switch for a screen reader; the control itself is hidden from it.
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <NativeSwitch testID={testID} checked={checked} onCheckedChange={set} disabled={disabled} />
        </View>
      }
    />
  );
}

/** One section of a NativeResourceSettingsPage (the web's `ResourceSettingsSection`). */
export interface NativeResourceSettingsSection {
  id: string;
  title: string;
  icon?: ReactNode;
  description?: string;
  /** The rows (NativeSettingsRow, NativeToggleRow). Absent: a jump link only, with `onSelect`. */
  content?: ReactNode;
  onSelect?: () => void;
}

export interface NativeResourceSettingsPageProps {
  sections: readonly NativeResourceSettingsSection[];
  /** The jump links' accessible name. Default "On this page". */
  navLabel?: string;
  className?: string;
  testID?: string;
}

export function NativeResourceSettingsPage({ sections, navLabel = "On this page", className, testID = "resource-settings-page" }: NativeResourceSettingsPageProps) {
  const scroll = useRef<{ scrollTo?: (to: { x?: number; y?: number; animated?: boolean }) => void } | null>(null);
  const offsets = useRef(new Map<string, number>());
  const [active, setActive] = useState(sections[0]?.id);

  const jump = (s: NativeResourceSettingsSection) => {
    setActive(s.id);
    if (s.content === undefined) {
      s.onSelect?.();
      return;
    }
    scroll.current?.scrollTo?.({ y: offsets.current.get(s.id) ?? 0, animated: true });
  };

  return (
    <ScrollView
      ref={scroll}
      testID={testID}
      className={cn("flex-1", className)}
      contentContainerClassName="gap-4 p-4"
      contentInsetAdjustmentBehavior="automatic"
      onScroll={(e: { nativeEvent: { contentOffset: { y: number } } }) => {
        const y = e.nativeEvent.contentOffset.y + 24;
        let current = sections[0]?.id;
        for (const s of sections) if ((offsets.current.get(s.id) ?? Infinity) <= y) current = s.id;
        if (current !== active) setActive(current);
      }}
      scrollEventThrottle={64}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={navLabel} contentContainerClassName="gap-2">
        {sections.map((s) => (
          <Pressable
            key={s.id}
            testID={`${testID}-link-${s.id}`}
            accessibilityRole="link"
            accessibilityState={{ selected: active === s.id }}
            onPress={() => jump(s)}
            className={cn("min-h-[36px] flex-row items-center gap-2 rounded-md px-3", active === s.id ? "bg-muted" : "bg-transparent")}
          >
            {s.icon ? <View accessibilityElementsHidden>{s.icon}</View> : null}
            <Text className={cn("text-sm", active === s.id ? "font-medium text-foreground" : "text-muted-foreground")}>{s.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {sections
        .filter((s) => s.content !== undefined)
        .map((s) => (
          <View
            key={s.id}
            onLayout={(e: { nativeEvent?: { layout?: { y?: number } } }) => offsets.current.set(s.id, e.nativeEvent?.layout?.y ?? 0)}
          >
            <NativeCard testID={`${testID}-section-${s.id}`} className="overflow-hidden">
              <View className="flex-row gap-3 border-b border-border px-4 py-3">
                {s.icon ? <View className="mt-0.5" accessibilityElementsHidden>{s.icon}</View> : null}
                <View className="min-w-0 flex-1">
                  <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
                    {s.title}
                  </Text>
                  {s.description ? <Text className="text-sm text-muted-foreground">{s.description}</Text> : null}
                </View>
              </View>
              <SectionRows>{s.content}</SectionRows>
            </NativeCard>
          </View>
        ))}
    </ScrollView>
  );
}

/** The section's rows with a line between each, as the web's divided card. */
function SectionRows({ children }: { children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).flat().filter((c) => c !== null && c !== undefined && c !== false);
  return (
    <View>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 ? <NativeListItemDivider /> : null}
          {row as ReactNode}
        </View>
      ))}
    </View>
  );
}
