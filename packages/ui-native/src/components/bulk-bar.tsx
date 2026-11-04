/**
 * BulkBar — the selection action bar: how many are selected, select all, the bulk actions,
 * and Clear. The twin of genesis-ui's `DataBulkBar`, with the same props; it renders nothing
 * while nothing is selected. On the phone it sits at the bottom of the screen, above the tab
 * bar: render it after the list, inside the screen (not over the tab bar).
 *
 * @stability Beta
 */
import { ScrollView, Text, View } from "react-native";
import type { NativeIconName } from "../icon-names";
import { cn } from "../utils";
import { NativeButton, buttonTextVariants } from "./button";
import { NativeCheckbox } from "./checkbox";
import { NativeIcon } from "./icon";

/** One button in the bar. */
export interface NativeBulkAction {
  label: string;
  /** A NativeIcon name (the web's `BulkAction` takes a lucide icon). */
  icon: NativeIconName;
  onClick: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  /** Inert while, say, a bulk mutation is in flight. */
  disabled?: boolean;
  /** `testID` on the button (the web's `testId`). */
  testId?: string;
}

export interface NativeBulkBarProps {
  selected: Set<string>;
  totalCount: number;
  onToggleAll: () => void;
  onClearSelection: () => void;
  actions: NativeBulkAction[];
  /** "{count} selected". Default English. */
  selectedLabel?: (count: number) => string;
  /** Default "Clear". */
  clearLabel?: string;
  /** Merged onto the bar. */
  className?: string;
  testID?: string;
}

export function NativeBulkBar({
  selected,
  totalCount,
  onToggleAll,
  onClearSelection,
  actions,
  selectedLabel = (count) => `${count} selected`,
  clearLabel = "Clear",
  className,
  testID = "native-bulk-bar",
}: NativeBulkBarProps) {
  if (selected.size === 0) return null;
  const all = selected.size === totalCount;
  return (
    <View
      testID={testID}
      accessibilityRole="toolbar"
      className={cn("mx-3 mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-md", className)}
    >
      <NativeCheckbox checked={all} onCheckedChange={() => onToggleAll()} testID={`${testID}-all`} />
      <Text className="text-sm font-medium text-foreground" accessibilityLiveRegion="polite">
        {selectedLabel(selected.size)}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1" contentContainerClassName="gap-2 px-1">
        {actions.map((action) => {
          const variant = action.variant ?? "outline";
          return (
            <NativeButton
              key={action.label}
              size="sm"
              variant={variant}
              onPress={action.onClick}
              disabled={action.disabled}
              testID={action.testId}
              accessibilityLabel={action.label}
            >
              <NativeIcon name={action.icon} size={16} />
              <Text className={buttonTextVariants({ variant, size: "sm" })}>{action.label}</Text>
            </NativeButton>
          );
        })}
      </ScrollView>
      <NativeButton size="sm" variant="ghost" onPress={onClearSelection} testID={`${testID}-clear`}>
        {clearLabel}
      </NativeButton>
    </View>
  );
}
