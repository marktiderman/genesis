import { cn } from "../../utils";
import type { LucideIcon } from "lucide-react";
import { DefaultLink, type LinkComponent } from "../../navigation";

export type StatCardColor = "primary" | "success" | "warning" | "info" | "destructive" | "muted";

const colorMap: Record<StatCardColor, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
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

export function StatCard({
  label,
  value,
  icon: Icon,
  color = "primary",
  href,
  linkComponent: Link = DefaultLink,
  trend,
  className,
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4", resolveColor(color))} />}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {trend && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            trend.value >= 0
              ? "text-primary"
              : "text-destructive",
          )}
        >
          {trend.value >= 0 ? "+" : ""}
          {trend.value}% {trend.label}
        </p>
      )}
    </>
  );

  const cardClasses = cn(
    "rounded-xl border border-border bg-card p-4 transition-all hover:shadow-md",
    href && "cursor-pointer hover:border-primary/30",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cardClasses}>
        {content}
      </Link>
    );
  }

  return <div className={cardClasses}>{content}</div>;
}
