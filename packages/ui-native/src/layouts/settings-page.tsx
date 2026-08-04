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
 * Layer-2 escape hatch: drop down to `<ScreenContainer>` if the layout
 * structure doesn't fit (see standards/usage-doctrine.md).
 *
 * @stability Beta
 */
import { Fragment, type ReactNode } from "react";
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

export interface SettingsPageProps extends ScreenHeaderProps {
  /** Sectioned content. Order is preserved. */
  sections: SettingsPageSection[];
  /**
   * Optional dangerous-action row(s) shown after the last section in a
   * destructive-tone footer. Typical: "Sign out", "Delete account".
   */
  dangerousActions?: {
    label: string;
    onPress: () => void;
    /** When true, renders with extra emphasis. Default `false`. */
    emphasized?: boolean;
    testID?: string;
  }[];
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
          {section.title ? (
            <NativeSectionListHeader
              title={section.title}
              testID={`${testID}-section-${section.id}-header`}
            />
          ) : null}
          <View className="border-y border-border bg-background">
            {section.rows.map((row, rowIndex) => (
              <Fragment key={row.id}>
                <NativeListItem
                  testID={row.testID ?? `${testID}-row-${row.id}`}
                  title={row.title}
                  subtitle={row.subtitle}
                  leading={row.leading}
                  trailing={row.trailing}
                  showChevron={row.showChevron}
                  onPress={row.onPress}
                  disabled={row.disabled}
                />
                {rowIndex < section.rows.length - 1 ? (
                  <NativeListItemDivider className="ml-4" />
                ) : null}
              </Fragment>
            ))}
          </View>
          {section.footnote ? (
            <NativeText
              preset="body-sm"
              className="px-4 pt-2 text-muted-foreground"
            >
              {section.footnote}
            </NativeText>
          ) : null}
        </View>
      ))}

      {dangerousActions && dangerousActions.length > 0 ? (
        <View
          testID={`${testID}-dangerous-actions`}
          className={cn("mt-8 gap-2 px-4")}
        >
          {dangerousActions.map((action) => (
            <NativeButton
              key={action.label}
              testID={action.testID ?? `${testID}-danger-${slug(action.label)}`}
              variant={action.emphasized ? "destructive" : "outline"}
              onPress={action.onPress}
            >
              {action.label}
            </NativeButton>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
