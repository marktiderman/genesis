/**
 * Nav-bar sub-primitives — escape hatches for `<Stack.Screen>` `headerLeft`,
 * `headerRight`, and custom title view.
 *
 * Use these when the named-prop slots on a layout aren't enough — e.g.,
 * a screen needs a save button on the right that's wired to dirty-state,
 * or a search bar replaces the title on a results screen.
 *
 * Pass directly into `headerLeft={() => <NavBarSearchBar ... />}` or
 * compose into a custom `headerTitle={() => <NavBarTitle ... />}` slot.
 *
 * @stability Beta
 */
import { Pressable, Text, TextInput, View } from "react-native";
import { nativeColors } from "@marktiderman/genesis-design-system/tokens/native";
import { cn } from "../utils";

// ---------------------------------------------------------------------------
// NavBarSaveButton
// ---------------------------------------------------------------------------

export interface NavBarSaveButtonProps {
  /** Press handler. Disabled when not provided OR when `disabled`/`loading`. */
  onPress?: () => void;
  /** Visible label. Default `"Save"`. */
  label?: string;
  /** When true, the button is muted and not pressable. Use this for clean / pristine forms. */
  disabled?: boolean;
  /** When true, label switches to a busy indicator and presses are blocked. */
  loading?: boolean;
  /** When true, render label in destructive tone. */
  destructive?: boolean;
  className?: string;
  testID?: string;
}

export function NavBarSaveButton({
  onPress,
  label = "Save",
  disabled,
  loading,
  destructive,
  className,
  testID,
}: NavBarSaveButtonProps) {
  const isDisabled = !!disabled || !!loading || !onPress;
  return (
    <Pressable
      testID={testID ?? "nav-bar-save-button"}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      className={cn("min-h-[44px] justify-center px-3", className)}
      hitSlop={8}
    >
      <Text
        className={cn(
          "text-base font-semibold",
          destructive ? "text-destructive" : "text-primary",
          isDisabled && "opacity-40"
        )}
      >
        {loading ? "…" : label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// NavBarTitle
// ---------------------------------------------------------------------------

export interface NavBarTitleProps {
  /** Title text. */
  title: string;
  /** Optional smaller subtitle line under the title. */
  subtitle?: string;
  /** Optional press handler — turns the title row into a tap target (e.g., reveal a picker). */
  onPress?: () => void;
  className?: string;
  testID?: string;
}

export function NavBarTitle({
  title,
  subtitle,
  onPress,
  className,
  testID,
}: NavBarTitleProps) {
  const inner = (
    <View className={cn("items-center justify-center", className)}>
      <Text
        testID={testID ? `${testID}-title` : undefined}
        className="text-base font-semibold text-foreground"
        numberOfLines={1}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          testID={testID ? `${testID}-subtitle` : undefined}
          className="text-xs text-muted-foreground"
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID ?? "nav-bar-title"}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        onPress={onPress}
        hitSlop={8}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View testID={testID ?? "nav-bar-title"} accessibilityRole="header">
      {inner}
    </View>
  );
}

// ---------------------------------------------------------------------------
// NavBarSearchBar
// ---------------------------------------------------------------------------

export interface NavBarSearchBarProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Called when the user submits the search (return key). */
  onSubmit?: () => void;
  /** Render a clear (X) button when value is non-empty. Default true. */
  clearable?: boolean;
  className?: string;
  testID?: string;
}

/**
 * Inline search input meant to occupy the title slot on a search results
 * screen. For a sticky search-below-the-header pattern, prefer the
 * standalone <NativeSearchBar> primitive.
 */
export function NavBarSearchBar({
  value,
  onChangeText,
  placeholder = "Search",
  onSubmit,
  clearable = true,
  className,
  testID,
}: NavBarSearchBarProps) {
  return (
    <View
      testID={testID ?? "nav-bar-search"}
      className={cn(
        "min-h-[36px] flex-row items-center rounded-full bg-muted px-3",
        className
      )}
    >
      <TextInput
        testID={testID ? `${testID}-input` : undefined}
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={nativeColors.neutral[400]}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode={clearable ? "while-editing" : "never"}
        className="flex-1 text-base text-foreground"
      />
      {clearable && value.length > 0 ? (
        <Pressable
          testID={testID ? `${testID}-clear` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          hitSlop={8}
          className="ml-2 px-1"
        >
          <Text className="text-base text-muted-foreground">×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
