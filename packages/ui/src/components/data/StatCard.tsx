import type { LucideIcon } from "lucide-react";
import type { LinkComponent } from "../../navigation";
import { formatTrend } from "@marktiderman/genesis-core/headless";
import { WidgetTile } from "./widget/WidgetTile";

export type StatCardColor = "primary" | "success" | "warning" | "info" | "destructive" | "muted";

const colorMap: Record<StatCardColor, string> = {
  primary: "text-primary-text",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon | undefined;
  /** Semantic color key or raw Tailwind class */
  color?: StatCardColor | string;
  /** When set, the card renders as a link to this path. */
  href?: string;
  /**
   * Injectable link component used when `href` is set. Defaults to a plain
   * `<a>` (no router). Pass a router adapter for client-side navigation.
   */
  linkComponent?: LinkComponent;
  trend?: { value: number; label: string };
  className?: string;
}

function resolveColor(color: string): string {
  return (colorMap as Record<string, string>)[color] ?? color;
}

/**
 * A labelled number on a dashboard: the stat tile. Draws the one widget tile
 * (`WidgetTile`, variant `stat`, part `stat-card`), so an app style changes it with every other
 * tile. For a number fed by a view, use `<Widget>` with a `number` widget.
 *
 * @stability Beta
 */
export function StatCard({
  label,
  value,
  icon,
  color = "primary",
  href,
  linkComponent,
  trend,
  className,
}: StatCardProps) {
  // The trend line is genesis-core's, as NativeStatCard's.
  const t = trend ? formatTrend(trend) : null;
  return (
    <WidgetTile
      variant="stat"
      label={label}
      value={value}
      icon={icon}
      iconClassName={resolveColor(color)}
      href={href}
      {...(linkComponent ? { linkComponent } : {})}
      className={className}
      detail={t?.text}
      detailClassName={t ? (t.positive ? "text-primary-text" : "text-destructive") : undefined}
    />
  );
}
