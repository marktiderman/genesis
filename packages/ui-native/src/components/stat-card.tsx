/**
 * StatCard — a labelled number on a dashboard: the twin of genesis-ui's StatCard, with the same
 * `label`, `value`, `color` and `trend`. `onPress` makes the tile a button (the web's `href`).
 * The trend line ("+12% vs last week") is genesis-core's `formatTrend`, as on the web.
 *
 * StatusBadge — a goal or task status as a tinted badge: the twin of genesis-ui's StatusBadge,
 * the status's tone from genesis-core's `STATUS_BADGE_TONES`, drawn by NativeBadge.
 *
 * UserAvatar — a person's photo, or their initials: the twin of genesis-ui's UserAvatar, on
 * NativeAvatar, with initials from genesis-core's `initialsOf` and the person's name as the label.
 *
 * @stability Beta
 */
import type { ReactNode } from "react";
import { formatTrend, STATUS_BADGE_TONES, statusBadgeLabel, type StatusBadgeStatus } from "@marktiderman/genesis-core/headless";
import { initialsOf } from "@marktiderman/genesis-core/resource-view";
import { NativeAvatar } from "./avatar";
import { NativeBadge } from "./badge";
import { WidgetTile } from "./widget-tile";
import { View } from "react-native";
import { cn } from "../utils";

export type NativeStatCardColor = "primary" | "success" | "warning" | "info" | "destructive" | "muted";

const ICON_TONE: Record<NativeStatCardColor, string> = {
  primary: "text-primary-text",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

export interface NativeStatCardProps {
  label: string;
  value: string | number;
  /** An icon (a NativeIcon) beside the label. */
  icon?: ReactNode;
  /** The icon's tone. Default `primary`. */
  color?: NativeStatCardColor;
  trend?: { value: number; label: string };
  /** Makes the tile a button (open the list behind the number). */
  onPress?: () => void;
  className?: string;
  testID?: string;
}

export function NativeStatCard({ label, value, icon, color = "primary", trend, onPress, className, testID = "native-stat-card" }: NativeStatCardProps) {
  const t = trend ? formatTrend(trend) : null;
  return (
    <WidgetTile
      variant="stat"
      label={label}
      value={value}
      icon={icon ? <View className={ICON_TONE[color]}>{icon}</View> : undefined}
      detail={t?.text}
      detailClassName={t ? (t.positive ? "text-primary-text" : "text-destructive") : undefined}
      onPress={onPress}
      className={className}
      testID={testID}
    />
  );
}

export interface NativeStatusBadgeProps {
  status: StatusBadgeStatus;
  /** The words. Default the status's ("On track"). */
  children?: ReactNode;
  className?: string;
  testID?: string;
}

export function NativeStatusBadge({ status, children, className, testID }: NativeStatusBadgeProps) {
  return (
    <NativeBadge variant={STATUS_BADGE_TONES[status]} className={className} testID={testID ?? `status-badge-${status}`}>
      {children ?? statusBadgeLabel(status)}
    </NativeBadge>
  );
}

export interface NativeUserAvatarProps {
  /** The person's full name: the initials and what a screen reader hears. */
  name: string;
  src?: string | null;
  /** `sm` 32, `default` 40, `lg` 48 points, as the web's sizes. */
  size?: "sm" | "default" | "lg";
  /** In a list of people: two letters for a one-word name, as the web's `distinct`. */
  distinct?: boolean;
  className?: string;
  testID?: string;
}

const AVATAR_SIZE = { sm: 32, default: 40, lg: 48 } as const;

export function NativeUserAvatar({ name, src, size = "default", distinct, className, testID }: NativeUserAvatarProps) {
  return (
    <NativeAvatar
      src={src}
      alt={name}
      fallback={initialsOf(name, { distinct }) || "?"}
      size={AVATAR_SIZE[size]}
      className={cn(className)}
      testID={testID ?? "native-user-avatar"}
    />
  );
}
