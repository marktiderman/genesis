import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem, cn } from "@marktiderman/genesis-ui";

export type ResponsesView = "summary" | "each";

/**
 * The Responses tab's toolbar: a Summary / Each response switch, the host's filters
 * (ResponsesFilters, or its own) and, on the right, its export actions (open a Sheet,
 * Download CSV).
 */
export function ResponsesToolbar({
  view,
  onViewChange,
  filters,
  actions,
  className,
}: {
  view: ResponsesView;
  onViewChange: (view: ResponsesView) => void;
  filters?: ReactNode;
  actions?: ReactNode;
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
          aria-label="Show responses as"
        >
          <ToggleGroupItem value="summary" className="h-9 px-3" data-testid="responses-view-summary">
            Summary
          </ToggleGroupItem>
          <ToggleGroupItem value="each" className="h-9 px-3" data-testid="responses-view-each">
            Each response
          </ToggleGroupItem>
        </ToggleGroup>
        {filters}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
