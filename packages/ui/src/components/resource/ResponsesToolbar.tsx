import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { cn } from "../../utils";

export type ResponsesView = "summary" | "each";

/**
 * The Responses tab's toolbar: a Summary / Each response switch, the host's filters
 * (forms-studio's ResponsesFilters, or its own) and, on the right, its export actions
 * (open a Sheet, Download CSV). `labels` renames the switch, e.g. "Each submission".
 */
export function ResponsesToolbar({
  view,
  onViewChange,
  filters,
  actions,
  labels = {},
  className,
}: {
  view: ResponsesView;
  onViewChange: (view: ResponsesView) => void;
  filters?: ReactNode | undefined;
  actions?: ReactNode;
  /** The switch's words. Defaults "Summary", "Each response" and "Show responses as". */
  labels?: { summary?: string | undefined; each?: string | undefined; group?: string | undefined } | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      data-slot="responses-toolbar"
      className={cn("flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between", className)}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          className="h-9"
          value={view}
          onValueChange={(v) => v && onViewChange(v as ResponsesView)}
          aria-label={labels.group ?? "Show responses as"}
        >
          <ToggleGroupItem value="summary" className="h-9 px-3" data-testid="responses-view-summary">
            {labels.summary ?? "Summary"}
          </ToggleGroupItem>
          <ToggleGroupItem value="each" className="h-9 px-3" data-testid="responses-view-each">
            {labels.each ?? "Each response"}
          </ToggleGroupItem>
        </ToggleGroup>
        {filters}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
