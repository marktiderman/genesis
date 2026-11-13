// WidgetTile: the one tile under every widget (ADR 0023). StatCard, HeadlineNumbers' numbers,
// SummaryCard and <Widget> all draw it, each in its own variant, so a style changes every tile
// through the same parts: the root (`widget`, `stat-card`, `headline-number`, `summary-card`) and
// the pieces inside it (`widget-label`, `widget-value`, `widget-detail`, `widget-body`).
//
// Each variant keeps the markup and classes its component had, so nothing renders differently.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../../utils";
import { DefaultLink, type LinkComponent } from "../../../navigation";

/** Which tile: a stat card, one headline number (inside a `<dl>`), a summary card, or a widget. */
export type WidgetTileVariant = "stat" | "headline" | "summary" | "widget";

/** A widget's state, as its tile shows it (`data-state`). */
export type WidgetTileState = "loading" | "error" | "empty" | "ready";

export interface WidgetTileProps {
  variant?: WidgetTileVariant;
  /** What the tile is called. */
  label: string;
  /** The number, or whatever stands for it. */
  value?: ReactNode;
  /** A short line under the value. */
  detail?: ReactNode;
  /** The detail's class (a tone's colour). */
  detailClassName?: string;
  /** An icon beside the label (stat, widget) or the title (summary). */
  icon?: LucideIcon | ReactNode;
  /** The icon's class (a colour). */
  iconClassName?: string;
  /** A short line on the header's right (summary, widget). */
  meta?: ReactNode;
  /** Under the value: a bar, a list, a chart, a summary's body. */
  children?: ReactNode;
  /** Makes the whole tile a link (stat, widget). */
  href?: string | undefined;
  linkComponent?: LinkComponent;
  /** What a widget is showing; set as `data-state`. */
  state?: WidgetTileState;
  /** The widget kind, set as `data-kind` (widget). */
  kind?: string;
  className?: string | undefined;
  testID?: string | undefined;
}

function iconNode(icon: WidgetTileProps["icon"], className: string): ReactNode {
  if (!icon) return null;
  if (typeof icon === "function" || (typeof icon === "object" && icon !== null && "render" in icon)) {
    const Icon = icon as LucideIcon;
    return <Icon className={className} />;
  }
  return icon as ReactNode;
}

/**
 * The tile every widget draws. Use the component that names the job (`StatCard`,
 * `HeadlineNumbers`, `SummaryCard`, `<Widget>`); reach for this one for a tile none of them
 * draws, so it still wears the app style's tile parts.
 *
 * @stability Beta
 */
export function WidgetTile({
  variant = "widget",
  label,
  value,
  detail,
  detailClassName,
  icon,
  iconClassName,
  meta,
  children,
  href,
  linkComponent: Link = DefaultLink,
  state = "ready",
  kind,
  className,
  testID,
}: WidgetTileProps) {
  if (variant === "headline") {
    // One number in a `<dl>`: a group of its term and details.
    return (
      <div
        data-slot="headline-number"
        data-testid={testID}
        className={cn("flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-4 text-card-foreground", className)}
      >
        <dt data-slot="widget-label" className="truncate text-sm text-muted-foreground">
          {label}
        </dt>
        <dd data-slot="widget-value" className="text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
          {value}
        </dd>
        {detail ? (
          <dd data-slot="widget-detail" className={cn("text-xs", detailClassName)}>
            {detail}
          </dd>
        ) : null}
      </div>
    );
  }

  if (variant === "summary") {
    return (
      <section
        aria-label={label}
        data-testid={testID}
        data-slot="summary-card"
        className={cn("flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground", className)}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 data-slot="widget-label" className="flex min-w-0 items-center gap-2 font-semibold">
            {icon ? (
              <span className="shrink-0 text-muted-foreground [&_svg]:size-4" aria-hidden>
                {iconNode(icon, "")}
              </span>
            ) : null}
            <span className="min-w-0 break-words">{label}</span>
          </h3>
          {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
        </header>
        {children}
      </section>
    );
  }

  if (variant === "stat") {
    const content = (
      <>
        <div className="flex items-center justify-between">
          <span data-slot="widget-label" className="text-sm text-muted-foreground">
            {label}
          </span>
          {iconNode(icon, cn("h-4 w-4", iconClassName))}
        </div>
        <p data-slot="widget-value" className="mt-2 text-2xl font-bold">
          {value}
        </p>
        {detail ? (
          <p data-slot="widget-detail" className={cn("mt-1 text-xs font-medium", detailClassName)}>
            {detail}
          </p>
        ) : null}
        {children}
      </>
    );
    const classes = cn(
      "rounded-xl border border-border bg-card p-4 transition-all hover:shadow-md",
      href && "cursor-pointer hover:border-primary/30",
      className,
    );
    return href ? (
      <Link href={href} className={classes} data-slot="stat-card" testID={testID}>
        {content}
      </Link>
    ) : (
      <div className={classes} data-slot="stat-card" data-testid={testID}>
        {content}
      </div>
    );
  }

  // A widget: label and meta, the value (or its state), and a body.
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span data-slot="widget-label" className="min-w-0 truncate text-sm text-muted-foreground">
          {label}
        </span>
        {meta ? <span className="shrink-0 text-xs text-muted-foreground">{meta}</span> : iconNode(icon, cn("h-4 w-4 shrink-0", iconClassName))}
      </div>
      {value !== undefined ? (
        <p data-slot="widget-value" className="text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </p>
      ) : null}
      {detail ? (
        <p data-slot="widget-detail" className={cn("text-xs text-muted-foreground", detailClassName)}>
          {detail}
        </p>
      ) : null}
      {children ? (
        <div data-slot="widget-body" className="min-w-0">
          {children}
        </div>
      ) : null}
    </>
  );
  const classes = cn(
    "flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground",
    href && "transition-all hover:border-primary/30 hover:shadow-md",
    className,
  );
  return href ? (
    <Link href={href} className={classes} data-slot="widget" data-kind={kind} data-state={state} testID={testID}>
      {content}
    </Link>
  ) : (
    <section aria-label={label} className={classes} data-slot="widget" data-kind={kind} data-state={state} data-testid={testID} aria-busy={state === "loading" || undefined}>
      {content}
    </section>
  );
}
