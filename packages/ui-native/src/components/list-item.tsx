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
 * `actions` gives the row its actions the iOS way (ADR 0028): behind a swipe (leading and
 * trailing, full swipe, iOS 26's round style with `actionsAppearance="round"`), in the long-press
 * menu (the system context menu with `GenesisModules.menu`), and as VoiceOver's actions.
 *
 * @stability Beta
 */
import { Platform, Pressable, Text, View } from "react-native";
import { cn } from "../utils";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useGenesisModules } from "../native-modules";
import type { RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import { NativeIcon } from "./icon";
import { useRowActions, type RowActionProps } from "./use-row-actions";

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
  /** How many lines the subtitle shows before it's cut short. Default 2; `null` wraps it whole (a value to read, an id). */
  subtitleLines?: number | null;
  /** The subtitle can be selected and copied (a value: an id, a URL). Default false. */
  subtitleSelectable?: boolean;
  disabled?: boolean;
  /**
   * What a pressable row is to a screen reader. Default `button`; a row that flips its switch
   * (NativeToggleRow) is a `switch`, and one choice of several (NativeWorkspaceSwitcher) a
   * `radio`, each with `accessibilityState.checked`.
   */
  accessibilityRole?: "button" | "switch" | "link" | "menuitem" | "radio";
  /**
   * What a screen reader reads for the row. Default its title and subtitle. The row is one
   * element, so a `trailing` badge's own label is not read: put its words here too.
   */
  accessibilityLabel?: string;
  /** Merged over the row's own (`disabled`). */
  accessibilityState?: { checked?: boolean; selected?: boolean };
  /** The row's actions: swipe, long-press menu and screen-reader actions, from one list. */
  actions?: readonly RowSwipeAction[];
  /** How the swipe draws them: `"fill"` (default) or iOS 26's `"round"`. */
  actionsAppearance?: "fill" | "round";
  className?: string;
  testID?: string;
}

const NO_ACTIONS: readonly RowSwipeAction[] = Object.freeze([]);

export function NativeListItem({ actions: given, actionsAppearance, ...props }: NativeListItemProps) {
  // A disabled row offers no actions; a row with actions is pressable, so its long press reaches the menu.
  const actions = props.disabled ? NO_ACTIONS : (given ?? NO_ACTIONS);
  const { rowProps, wrap } = useRowActions(actions, {
    title: props.title,
    ...(actionsAppearance ? { appearance: actionsAppearance } : {}),
    testID: `${props.testID ?? "native-list-item"}-actions`,
  });
  const row = <ListItemRow {...props} actionProps={rowProps} pressable={actions.length > 0} />;
  return actions.length ? <>{wrap(row)}</> : row;
}

function ListItemRow({
  title,
  subtitle,
  leading,
  trailing,
  showChevron,
  onPress,
  subtitleLines = 2,
  subtitleSelectable = false,
  disabled,
  accessibilityRole = "button",
  accessibilityState,
  accessibilityLabel,
  className,
  testID,
  pressable,
  actionProps,
  ...rest
}: Omit<NativeListItemProps, "actions" | "actionsAppearance"> & { pressable?: boolean; actionProps?: RowActionProps }) {
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
            {...(subtitleLines === null ? {} : { numberOfLines: subtitleLines })}
            selectable={subtitleSelectable}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View className="ml-3">{trailing}</View> : null}
      {showChevron ? <Chevron /> : null}
    </>
  );

  if (onPress || pressable) {
    return (
      <Pressable
        testID={testID ?? "native-list-item"}
        // A row that only carries actions isn't a button: no role, and VoiceOver offers its actions.
        accessibilityRole={onPress ? accessibilityRole : "none"}
        accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
        accessibilityState={{ disabled, ...accessibilityState }}
        disabled={disabled}
        onPress={onPress}
        {...actionProps}
        {...rest}
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
      {...rest}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      className={cn(
        "min-h-[44px] flex-row items-center bg-background px-4 py-3",
        className
      )}
    >
      {inner}
    </View>
  );
}

/**
 * The drill-in chevron: an SF Symbol on iOS or the app's icon set
 * (`modules.symbol` / `modules.icons`) when given, else a text "›".
 */
function Chevron() {
  const { symbol, icons } = useGenesisModules();
  const roles = useThemeRoles();
  if ((Platform.OS === "ios" && symbol) || icons?.["chevron-right"]) {
    return (
      <View className="ml-2">
        <NativeIcon name="chevron-right" size={14} weight="semibold" color={roles.tertiaryLabel} testID="native-list-item-chevron" />
      </View>
    );
  }
  return (
    <Text
      accessibilityElementsHidden
      className="ml-2 text-base text-muted-foreground"
    >
      ›
    </Text>
  );
}

export function NativeListItemDivider({ className }: { className?: string }) {
  return <View className={cn("h-px bg-border", className)} />;
}
