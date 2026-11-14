/**
 * The resource workspace's pieces on the phone (a form, a course, a lesson): the twins of
 * genesis-ui's `/resource` components, over the same genesis-core rules
 * (`@marktiderman/genesis-core/resource`).
 *
 * - NativeReadinessChip: "Ready to publish", or how many problems to fix (`readinessChip`).
 * - NativeHeadlineNumbers: a grid of headline numbers, two across (`HeadlineNumber`).
 * - NativeSummaryCard: one card of a summary: an icon, a title, a line on the right, then the body.
 * - NativeFollowUpList: responses that need a follow-up, with their tag, comment, low score and actions.
 * - NativeResponsesToolbar: Summary / Each response, the host's filters and its actions.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { readinessChip, type ChipTone, type HeadlineNumber, type HeadlineTone, type Readiness, type ReadinessLabels } from "@marktiderman/genesis-core/resource";
import { NativeBadge } from "./badge";
import { NativeCard } from "./card";
import { NativeSegmentedControl } from "./segmented-control";
import { NativeSkeleton } from "./skeleton";
import { WidgetTile } from "./widget-tile";
import { cn } from "../utils";

/** A chip in one of the workspace's tones, on NativeBadge's tints (as the web's Chip on Badge). */
function ToneChip({ tone, children, testID }: { tone: ChipTone; children: ReactNode; testID?: string | undefined }) {
  return (
    <NativeBadge variant={tone} testID={testID}>
      {children}
    </NativeBadge>
  );
}

export interface NativeReadinessChipProps {
  readiness: Readiness;
  labels?: ReadinessLabels;
  /** Makes it a button (open the checks). */
  onPress?: () => void;
  className?: string;
}

export function NativeReadinessChip({ readiness, labels, onPress, className }: NativeReadinessChipProps) {
  const { label, tone } = readinessChip(readiness, labels);
  const mark = readiness.state === "ready" ? "✓ " : readiness.state === "problems" ? "! " : readiness.state === "warnings" ? "⚠ " : "";
  const chip = (
    <View className={className}>
      <ToneChip tone={tone} testID="readiness">
        {`${mark}${label}`}
      </ToneChip>
    </View>
  );
  if (!onPress) return chip;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} className="self-start">
      {chip}
    </Pressable>
  );
}

const HEADLINE_TONE: Record<HeadlineTone, string> = {
  positive: "text-emerald-700 dark:text-emerald-300",
  negative: "text-red-700 dark:text-red-300",
  warning: "text-amber-800 dark:text-amber-200",
  muted: "text-muted-foreground",
};

export interface NativeHeadlineNumbersProps {
  numbers: readonly HeadlineNumber[];
  isLoading?: boolean;
  className?: string;
}

export function NativeHeadlineNumbers({ numbers, isLoading = false, className }: NativeHeadlineNumbersProps) {
  if (isLoading) {
    return (
      <View className={cn("flex-row flex-wrap gap-3", className)} testID="headline-numbers-loading">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="min-w-[45%] flex-1">
            <NativeSkeleton height={112} className="w-full rounded-lg" />
          </View>
        ))}
      </View>
    );
  }
  if (!numbers.length) return null;
  return (
    <View className={cn("flex-row flex-wrap gap-3", className)} testID="headline-numbers">
      {numbers.map((n) => (
        <View key={n.key} className="min-w-[45%] flex-1">
          <WidgetTile
            variant="headline"
            label={n.label}
            value={n.value}
            detail={n.detail}
            detailClassName={HEADLINE_TONE[n.tone ?? "muted"]}
            testID={`headline-${n.key}`}
          />
        </View>
      ))}
    </View>
  );
}

export interface NativeSummaryCardProps {
  icon?: ReactNode;
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
  testID?: string;
}

export function NativeSummaryCard({ icon, title, meta, children, className, testID }: NativeSummaryCardProps) {
  return (
    <WidgetTile variant="summary" label={title} icon={icon} meta={meta} className={className} testID={testID}>
      {children}
    </WidgetTile>
  );
}

/** One item in the follow-up list, as the host describes it (the web's `FollowUpEntry`). */
export interface NativeFollowUpEntry {
  id: string;
  name: string;
  tag?: { label: string; tone?: ChipTone | undefined } | undefined;
  meta?: string | undefined;
  comment?: string | null | undefined;
  rating?: { value: number; max: number } | null | undefined;
}

export interface NativeFollowUpListProps {
  entries: readonly NativeFollowUpEntry[];
  actions?: (entry: NativeFollowUpEntry) => ReactNode;
  title?: string;
  isLoading?: boolean;
  empty?: string;
  noComment?: string;
  className?: string;
}

export function NativeFollowUpList({
  entries,
  actions,
  title = "Needs a follow-up",
  isLoading = false,
  empty = "Nothing to follow up right now.",
  noComment = "No comment",
  className,
}: NativeFollowUpListProps) {
  return (
    <NativeCard className={cn("gap-3 p-4", className)} testID="follow-up-list">
      <View className="flex-row items-center justify-between gap-2">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          ⚠ {title}
        </Text>
        {!isLoading ? (
          <NativeBadge variant="muted" accessibilityLabel={`${entries.length}`}>
            {String(entries.length)}
          </NativeBadge>
        ) : null}
      </View>
      {isLoading ? (
        <>
          <NativeSkeleton height={96} className="w-full rounded-md" />
          <NativeSkeleton height={96} className="w-full rounded-md" />
        </>
      ) : entries.length === 0 ? (
        <Text className="text-sm text-muted-foreground">✓ {empty}</Text>
      ) : (
        entries.map((entry) => {
          const buttons = actions?.(entry);
          return (
            <View key={entry.id} testID={`follow-up-${entry.id}`} className="gap-1.5 rounded-md border border-border p-3">
              <View className="flex-row items-start justify-between gap-2">
                <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
                  <Text className="font-medium text-foreground">{entry.name}</Text>
                  {entry.tag ? <ToneChip tone={entry.tag.tone ?? "muted"}>{entry.tag.label}</ToneChip> : null}
                </View>
                {entry.rating ? (
                  <Text
                    accessibilityLabel={`Rated ${entry.rating.value} out of ${entry.rating.max}`}
                    className="text-sm font-medium text-amber-800 dark:text-amber-200"
                  >
                    {entry.rating.value} ★
                  </Text>
                ) : null}
              </View>
              {entry.meta ? <Text className="text-xs text-muted-foreground">{entry.meta}</Text> : null}
              <Text numberOfLines={3} className={cn("text-sm", entry.comment ? "text-foreground" : "text-muted-foreground")}>
                {entry.comment || noComment}
              </Text>
              {buttons ? <View className="mt-1 flex-row flex-wrap gap-2">{buttons}</View> : null}
            </View>
          );
        })
      )}
    </NativeCard>
  );
}

export type NativeResponsesView = "summary" | "each";

export interface NativeResponsesToolbarProps {
  view: NativeResponsesView;
  onViewChange: (view: NativeResponsesView) => void;
  filters?: ReactNode;
  actions?: ReactNode;
  labels?: { summary?: string; each?: string };
  className?: string;
}

export function NativeResponsesToolbar({ view, onViewChange, filters, actions, labels = {}, className }: NativeResponsesToolbarProps) {
  return (
    <View className={cn("gap-2", className)} testID="responses-toolbar">
      <NativeSegmentedControl<NativeResponsesView>
        testID="responses-view"
        options={[
          { value: "summary", label: labels.summary ?? "Summary" },
          { value: "each", label: labels.each ?? "Each response" },
        ]}
        value={view}
        onChange={onViewChange}
      />
      {filters ? <View className="flex-row flex-wrap items-center gap-2">{filters}</View> : null}
      {actions ? <View className="flex-row flex-wrap items-center gap-2">{actions}</View> : null}
    </View>
  );
}
