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
import { Fragment, type ReactNode } from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { View } from "react-native";
import { NativeListItem, NativeListItemDivider } from "../components/list-item";
import { NativeSectionListHeader } from "../components/section-list";
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

  return (
    <ScreenContainer
      scroll
      safeAreaEdges={["left", "right", "bottom"]}
      testID={testID}
      contentClassName="pb-8"
      className={className}
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
          <View className="border-y border-border bg-background">
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

function DefaultSectionHeader({ title, testID }: SettingsPageSlotMap["sectionHeader"]) {
  return <NativeSectionListHeader title={title} testID={testID} />;
}

function DefaultRow({ isLast, id: _id, ...row }: SettingsPageSlotMap["row"]) {
  return (
    <>
      <NativeListItem
        testID={row.testID}
        title={row.title}
        subtitle={row.subtitle}
        leading={row.leading}
        trailing={row.trailing}
        showChevron={row.showChevron}
        onPress={row.onPress}
        disabled={row.disabled}
      />
      {isLast ? null : <NativeListItemDivider className="ml-4" />}
    </>
  );
}

function DefaultFootnote({ text }: SettingsPageSlotMap["footnote"]) {
  return (
    <NativeText preset="body-sm" className="px-4 pt-2 text-muted-foreground">
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
