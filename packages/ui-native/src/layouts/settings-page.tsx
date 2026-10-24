/**
 * SettingsPage — top-level settings layout.
 *
 * Composes `<ScreenContainer scroll>` underneath, renders a sectioned
 * `ListItem` list, and surfaces an optional dangerous-action footer
 * (e.g., "Sign out", "Delete account") in destructive tone.
 *
 * Why ship a layout: every consumer rebuilds this list with the same
 * three pieces (sections → rows → footer). Genesis ships the assembly so
 * consumers compose, not rebuild.
 *
 * Layer-3 customization: pass `headerTitle`, `headerLeft`, `headerRight`,
 * `large`, `scrollEdgeBehavior`, OR a direct `headerOptions={...}`
 * passthrough. The composed options are rendered via the consumer's own
 * `<Stack.Screen options={...}>` — see `getStackScreenOptions()` helper.
 *
 * Colors come from theme roles (`useThemeRoles`). On iOS it is the Settings
 * app's inset grouped style: the page is `systemGroupedBackground`, each
 * section a rounded group of cells on `secondarySystemGroupedBackground` with
 * hairline `separator` lines between cells, inset from the leading edge to
 * the cell text; the header is an uppercase footnote in `secondaryLabel`
 * above the group and the footnote sits under it in the same color. On
 * Android, cells are full width and the header is a Material subheader in the
 * theme's primary color. Neither platform draws a band or a rule behind a
 * header. Cell content itself is `NativeListItem`'s.
 *
 * Slots: replace or drop one part without leaving the layout. `slots`
 * swaps a part (`sectionHeader`, `row`, `footnote`, `dangerousActions`) for
 * your component, which receives exactly the props the default would;
 * `slotProps` feeds the default more props; `null` drops the part.
 *
 * Escape hatch: drop down to `<ScreenContainer>` if the layout structure
 * doesn't fit.
 *
 * @stability Beta
 */
import { Fragment, useState, type ReactNode } from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { Platform, StyleSheet, View } from "react-native";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { NativeListItem } from "../components/list-item";
import { NativeText } from "../components/text";
import { NativeButton } from "../components/button";
import { cn } from "../utils";
import {
  ScreenContainer,
  composeHeaderOptions,
  type ScreenHeaderProps,
} from "./screen-container";

export interface SettingsPageRow {
  /** Stable id for keying. */
  id: string;
  title: string;
  subtitle?: string;
  /** Leading slot (icon, avatar, etc.). */
  leading?: ReactNode;
  /** Trailing slot (badge, switch, version string, etc.). */
  trailing?: ReactNode;
  /** When true, renders a chevron at the row end (drill-in affordance). */
  showChevron?: boolean;
  /** Press handler — required for chevron rows. */
  onPress?: () => void;
  /** Disable the row (greyed + non-pressable). */
  disabled?: boolean;
  /** testID override for the row. Falls back to `settings-row-<id>`. */
  testID?: string;
}

export interface SettingsPageSection {
  /** Stable id for keying. */
  id: string;
  /** Optional uppercase section header. Pass `null` to skip the header for an unlabeled section. */
  title?: string;
  /** Optional caption rendered under the rows (compliance text, hint, etc.). */
  footnote?: string;
  /** Rows in render order. */
  rows: SettingsPageRow[];
}

/** A destructive-tone action in the footer, e.g. "Sign out". */
export interface SettingsPageDangerousAction {
  label: string;
  onPress: () => void;
  /** When true, renders with extra emphasis. Default `false`. */
  emphasized?: boolean;
  testID?: string;
}

/** The parts of a {@link SettingsPage} that `slots` and `slotProps` reach, with the props each receives. */
export type SettingsPageSlotMap = {
  sectionHeader: { title: string; testID: string };
  row: SettingsPageRow & { testID: string; isLast: boolean };
  footnote: { text: string };
  dangerousActions: { actions: SettingsPageDangerousAction[]; testID: string };
};

export interface SettingsPageProps extends ScreenHeaderProps {
  /** Sectioned content. Order is preserved. */
  sections: SettingsPageSection[];
  /**
   * Optional dangerous-action row(s) shown after the last section in a
   * destructive-tone footer. Typical: "Sign out", "Delete account".
   */
  dangerousActions?: SettingsPageDangerousAction[];
  /** Replace (a component) or drop (`null`) one part. */
  slots?: Slots<SettingsPageSlotMap>;
  /** More props for a default part, merged over what the layout passes. */
  slotProps?: SlotPropsFor<SettingsPageSlotMap>;
  /** Override root container styling. */
  className?: string;
  /** testID on the root container. Default `"settings-page"`. */
  testID?: string;
  /** Pass-through children rendered ABOVE the first section (e.g., a profile card). */
  children?: ReactNode;
}

/**
 * Convenience helper for callers that want to wire `<Stack.Screen options={...}>`
 * without re-importing composeHeaderOptions. Defaults `large: true` and
 * `scrollEdgeBehavior: "match"` to match the Apple HIG large-title settings
 * pattern out of the box.
 */
export function getSettingsPageStackOptions(
  props: ScreenHeaderProps & { headerTitle?: string },
): Record<string, unknown> {
  return composeHeaderOptions({
    headerTitle: props.headerTitle ?? "Settings",
    large: props.large ?? true,
    scrollEdgeBehavior: props.scrollEdgeBehavior ?? "match",
    headerLeft: props.headerLeft,
    headerRight: props.headerRight,
    headerOptions: props.headerOptions,
  });
}

export function SettingsPage({
  sections,
  dangerousActions,
  className,
  testID = "settings-page",
  children,
  slots = {},
  slotProps = {},
}: SettingsPageProps) {
  // Note: header props (headerTitle, headerLeft, headerRight, etc.) are
  // accepted on the type for API ergonomics but consumed by
  // getSettingsPageStackOptions() at the consumer's <Stack.Screen> level.
  const colors = useThemeRoles();
  const inset = Platform.OS === "ios";

  return (
    <ScreenContainer
      scroll
      safeAreaEdges={["left", "right", "bottom"]}
      testID={testID}
      contentClassName="pb-8"
      className={className}
      style={{ backgroundColor: colors.groupedBackground }}
    >
      {children ? <View className="px-4 pt-2">{children}</View> : null}

      {sections.map((section) => (
        <View
          key={section.id}
          testID={`${testID}-section-${section.id}`}
          className="mt-6"
        >
          {section.title
            ? renderSlot(
                DefaultSectionHeader,
                slots.sectionHeader,
                { title: section.title, testID: `${testID}-section-${section.id}-header` },
                slotProps.sectionHeader,
              )
            : null}
          <View
            testID={`${testID}-section-${section.id}-group`}
            className={inset ? "overflow-hidden" : "border-y"}
            style={[
              { backgroundColor: colors.surface, borderColor: colors.separator },
              inset ? { marginHorizontal: IOS_GROUP_MARGIN, borderRadius: iosGroupRadius() } : null,
            ]}
          >
            {section.rows.map((row, rowIndex) => (
              <Fragment key={row.id}>
                {renderSlot(
                  DefaultRow,
                  slots.row,
                  { ...row, testID: row.testID ?? `${testID}-row-${row.id}`, isLast: rowIndex === section.rows.length - 1 },
                  slotProps.row,
                )}
              </Fragment>
            ))}
          </View>
          {section.footnote
            ? renderSlot(DefaultFootnote, slots.footnote, { text: section.footnote }, slotProps.footnote)
            : null}
        </View>
      ))}

      {dangerousActions && dangerousActions.length > 0
        ? renderSlot(
            DefaultDangerousActions,
            slots.dangerousActions,
            {
              actions: dangerousActions.map((action) => ({ ...action, testID: action.testID ?? `${testID}-danger-${slug(action.label)}` })),
              testID: `${testID}-dangerous-actions`,
            },
            slotProps.dangerousActions,
          )
        : null}
    </ScreenContainer>
  );
}

/** UIKit's inset grouped margin on a phone, in points. */
const IOS_GROUP_MARGIN = 16;

/** UIKit's inset grouped corner radius: 10pt through iOS 18, 26pt from iOS 26. */
function iosGroupRadius(): number {
  return Number.parseFloat(String(Platform.Version)) >= 26 ? 26 : 10;
}

/** From iOS 26 a separator also stops short of the trailing edge. */
function iosTrailingSeparatorInset(): boolean {
  return Platform.OS === "ios" && Number.parseFloat(String(Platform.Version)) >= 26;
}

/**
 * iOS: the Settings app's inset grouped header, an uppercase footnote in
 * `secondaryLabel` on the page background. It sits over the group (same
 * margin) and is padded like a cell (`px-4`), so it lines up with the cell
 * text. Android: a Material list subheader in the brand's primary color
 * (`text-primary`, which follows the app's theme). Neither draws a band or a
 * rule. iOS reads uppercased text as written in capitals, so the label is the
 * title as written, and VoiceOver doesn't spell short words out.
 */
function DefaultSectionHeader({ title, testID }: SettingsPageSlotMap["sectionHeader"]) {
  const colors = useThemeRoles();
  if (Platform.OS === "ios") {
    return (
      <NativeText
        testID={testID}
        accessibilityRole="header"
        accessibilityLabel={title}
        dynamicTypeRamp="footnote"
        className="px-4 pb-1.5 pt-2"
        style={{
          marginHorizontal: IOS_GROUP_MARGIN,
          color: colors.secondaryLabel,
          fontSize: 13,
          lineHeight: 18,
          textTransform: "uppercase",
        }}
      >
        {title}
      </NativeText>
    );
  }
  return (
    <NativeText
      testID={testID}
      accessibilityRole="header"
      className="px-4 pb-2 pt-4 text-primary"
      style={{ fontSize: 14, lineHeight: 20, fontWeight: "500" }}
    >
      {title}
    </NativeText>
  );
}

function DefaultRow({ isLast, id: _id, leading, ...row }: SettingsPageSlotMap["row"]) {
  const colors = useThemeRoles();
  // A separator starts at the cell text: the same `px-4` (and `mr-3` past a
  // leading icon, measured once it lays out) as `NativeListItem`, so it lines
  // up whatever the NativeWind rem is. A row lays out start to end, so this
  // follows right-to-left layouts too.
  const [leadingWidth, setLeadingWidth] = useState(0);
  return (
    <>
      <NativeListItem
        testID={row.testID}
        // The cell wrapper carries the surface color from theme roles.
        className="bg-transparent"
        title={row.title}
        subtitle={row.subtitle}
        leading={
          leading ? (
            <View onLayout={(event) => setLeadingWidth(event.nativeEvent.layout.width)}>{leading}</View>
          ) : undefined
        }
        trailing={row.trailing}
        showChevron={row.showChevron}
        onPress={row.onPress}
        disabled={row.disabled}
      />
      {isLast ? null : (
        <View
          testID={`${row.testID}-separator`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="flex-row"
          style={{ height: StyleSheet.hairlineWidth }}
        >
          <View className="w-4" />
          {leading ? <View className="mr-3" style={{ width: leadingWidth }} /> : null}
          <View testID={`${row.testID}-separator-line`} className="flex-1" style={{ backgroundColor: colors.separator }} />
          {iosTrailingSeparatorInset() ? <View className="w-4" /> : null}
        </View>
      )}
    </>
  );
}

function DefaultFootnote({ text }: SettingsPageSlotMap["footnote"]) {
  const colors = useThemeRoles();
  if (Platform.OS === "ios") {
    return (
      <NativeText
        dynamicTypeRamp="footnote"
        className="px-4 pt-1.5"
        style={{ marginHorizontal: IOS_GROUP_MARGIN, color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}
      >
        {text}
      </NativeText>
    );
  }
  return (
    <NativeText preset="body-sm" className="px-4 pt-2" style={{ color: colors.secondaryLabel }}>
      {text}
    </NativeText>
  );
}

function DefaultDangerousActions({ actions, testID }: SettingsPageSlotMap["dangerousActions"]) {
  return (
    <View testID={testID} className={cn("mt-8 gap-2 px-4")}>
      {actions.map((action) => (
        <NativeButton
          key={action.label}
          testID={action.testID}
          variant={action.emphasized ? "destructive" : "outline"}
          onPress={action.onPress}
        >
          {action.label}
        </NativeButton>
      ))}
    </View>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
