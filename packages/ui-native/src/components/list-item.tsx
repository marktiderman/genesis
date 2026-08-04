/**
 * ListItem — recurring row in a list (settings, contacts, results).
 *
 * Slots: leading (avatar / icon), title, subtitle, trailing
 * (chevron / accessory / action). Supports pressable variants with
 * automatic divider rendering between adjacent items via a wrapper
 * pattern (see <NativeListItemDivider>).
 *
 * For platform-default chevrons, pass `showChevron`; the chevron uses
 * the muted-foreground token.
 *
 * @stability Beta
 */
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";

export interface NativeListItemProps {
  title: string;
  subtitle?: string;
  /** Slot rendered to the left of the title (avatar / icon). */
  leading?: React.ReactNode;
  /** Slot rendered to the right of the title (badge / accessory). */
  trailing?: React.ReactNode;
  /** When true, renders a chevron-right at the end. */
  showChevron?: boolean;
  /** When provided, the row becomes pressable. */
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  testID?: string;
}

export function NativeListItem({
  title,
  subtitle,
  leading,
  trailing,
  showChevron,
  onPress,
  disabled,
  className,
  testID,
}: NativeListItemProps) {
  const inner = (
    <>
      {leading ? <View className="mr-3">{leading}</View> : null}
      <View className="flex-1">
        <Text className="text-base text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            className="mt-0.5 text-xs text-muted-foreground"
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View className="ml-3">{trailing}</View> : null}
      {showChevron ? (
        <Text
          accessibilityElementsHidden
          className="ml-2 text-base text-muted-foreground"
        >
          ›
        </Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID ?? "native-list-item"}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        className={cn(
          "min-h-[44px] flex-row items-center bg-background px-4 py-3",
          disabled && "opacity-50",
          className
        )}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID ?? "native-list-item"}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      className={cn(
        "min-h-[44px] flex-row items-center bg-background px-4 py-3",
        className
      )}
    >
      {inner}
    </View>
  );
}

export function NativeListItemDivider({ className }: { className?: string }) {
  return <View className={cn("h-px bg-border", className)} />;
}
