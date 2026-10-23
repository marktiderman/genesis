import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, cn } from "@marktiderman/genesis-ui";
import { Check, CircleAlert, TriangleAlert } from "lucide-react";
import { Chip } from "./chip";
import { readinessChip, type NavItem, type Readiness } from "./status";

/**
 * "Ready to publish", or how many problems to fix: for the trailing slot of a resource
 * page's row of tabs. With `onClick` it is a button (open the checks).
 */
export function ReadinessChip({
  readiness,
  onClick,
  className,
}: {
  readiness: Readiness;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const { label, tone } = readinessChip(readiness);
  const icon =
    readiness.state === "ready" ? <Check /> : readiness.state === "problems" ? <CircleAlert /> : readiness.state === "warnings" ? <TriangleAlert /> : null;
  const chip = (
    <Chip tone={tone} icon={icon} testID="readiness" className={className}>
      {label}
    </Chip>
  );
  if (!onClick) return chip;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {chip}
    </button>
  );
}

/**
 * TEMPORARY: a row of tabs for a page's child items (`formNavItems`), with counts and a
 * trailing slot, until the app shell's sub-navigation renders a page's child items itself. It is only the row; the
 * host shows the panel for `value`. Remove it once genesis-ui ships shell sub-nav.
 */
export function SubNavTabsFallback<Id extends string>({
  items,
  value,
  onValueChange,
  trailing,
  className,
}: {
  items: readonly NavItem<Id>[];
  value: Id;
  onValueChange: (id: Id) => void;
  /** The row's right-hand side: a ReadinessChip. */
  trailing?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("flex flex-col-reverse gap-2 border-b border-border sm:flex-row sm:items-end sm:justify-between sm:gap-3", className)}>
      <div className="min-w-0 sm:flex-1">
      <Tabs defaultValue={value} value={value} onValueChange={(v) => onValueChange(v as Id)} className="w-full">
        <TabsList className="h-auto max-w-full justify-start gap-5 overflow-x-auto rounded-none bg-transparent p-0">
          {items.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              data-testid={`subnav-${item.id}`}
              className="-mb-px shrink-0 gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-2 pt-1 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {item.label}
              {item.badge != null ? (
                <span className="rounded-full bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                  {item.badge}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      </div>
      {trailing ? <div className="shrink-0 sm:pb-2">{trailing}</div> : null}
    </div>
  );
}
