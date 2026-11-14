/**
 * The one tile under the phone's stat card, headline numbers and summary cards, as genesis-ui's
 * WidgetTile is on the web: a NativeCard with a label (and an icon or a line on the right), a
 * value, a detail line and a body. Not exported: use NativeStatCard, NativeHeadlineNumbers or
 * NativeSummaryCard, the components that name the job.
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { NativeCard } from "./card";
import { cn } from "../utils";

export interface WidgetTileProps {
  variant: "stat" | "headline" | "summary";
  label: string;
  value?: ReactNode;
  detail?: ReactNode;
  detailClassName?: string | undefined;
  icon?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  onPress?: (() => void) | undefined;
  className?: string | undefined;
  testID?: string | undefined;
}

const asText = (node: ReactNode, className: string) =>
  typeof node === "string" || typeof node === "number" ? <Text className={className}>{node}</Text> : node;

export function WidgetTile({ variant, label, value, detail, detailClassName, icon, meta, children, onPress, className, testID }: WidgetTileProps) {
  const spoken = [label, typeof value === "string" || typeof value === "number" ? String(value) : null, typeof detail === "string" ? detail : null]
    .filter(Boolean)
    .join(", ");
  const body = (
    <NativeCard className={cn("gap-1 p-4", className)} testID={testID}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          {variant === "summary" && icon ? <View accessibilityElementsHidden>{icon}</View> : null}
          <Text
            numberOfLines={variant === "summary" ? 2 : 1}
            className={variant === "summary" ? "flex-1 text-base font-semibold text-foreground" : "flex-1 text-sm font-medium text-muted-foreground"}
          >
            {label}
          </Text>
        </View>
        {variant !== "summary" && icon ? <View accessibilityElementsHidden>{icon}</View> : null}
        {meta ? asText(meta, "text-xs text-muted-foreground") : null}
      </View>
      {value !== undefined ? asText(value, variant === "headline" ? "text-3xl font-bold text-foreground" : "text-2xl font-bold text-foreground") : null}
      {detail ? asText(detail, cn("text-xs text-muted-foreground", detailClassName)) : null}
      {children ? <View className="mt-2">{children}</View> : null}
    </NativeCard>
  );
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress}>
        {body}
      </Pressable>
    );
  }
  if (variant === "summary") return body;
  return (
    <View accessible accessibilityLabel={spoken}>
      {body}
    </View>
  );
}
