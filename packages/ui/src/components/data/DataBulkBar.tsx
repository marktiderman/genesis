import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils";
import { fillMessage, useUiMessages } from "../../messages";

/**
 * One button in the bulk action bar.
 *
 * @stability Stable
 */
export interface BulkAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: ("default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link") | undefined;
  /**
   * Makes this action inert: it renders with the Button primitive's native
   * `disabled` attribute, so it is neither clickable nor focusable, and it
   * picks up the disabled styling.
   *
   * The case this exists for is an in-flight bulk mutation. A consumer that
   * fires a move/duplicate/delete over the selected ids wants every bulk
   * action dead until it settles, so a user cannot double-fire a destructive
   * operation on the same selection. Without this field the only guard
   * available is an early return inside `onClick` — which does stop the
   * second call, but leaves the button looking live, so the affordance lies
   * about what pressing it will do. Concretely, that is what blocks a real
   * consumer's hand-rolled bulk bar from migrating to `DataBulkBar`: it
   * would have to give up its double-submit guard to do so.
   *
   * Optional and defaulted off — omitting it behaves exactly as before.
   */
  disabled?: boolean | undefined;
  /**
   * `data-testid` on the rendered button.
   *
   * Without it, a consumer migrating a hand-rolled bulk bar to `DataBulkBar`
   * loses every selector its e2e suite uses to drive one — which is a real
   * reason not to migrate, and the kind of small missing affordance that
   * keeps a parallel implementation alive.
   */
  testId?: string | undefined;
  /**
   * Why the action can't run (ADR 0017): the button stays disabled and says this as its tooltip
   * and accessible description, so people learn why rather than meeting a dead button.
   */
  reason?: string | undefined;
}

export interface DataBulkBarProps {
  selected: Set<string>;
  totalCount: number;
  onToggleAll: () => void;
  onClearSelection: () => void;
  actions: BulkAction[];
  /** Merged onto the bar, not replacing its positioning. */
  className?: string;
  /**
   * Every row the list's filters match, when more than are loaded: with every loaded row
   * selected, the bar offers "Select all {total} matching".
   */
  matchingTotal?: number | undefined;
  /** Every matching row is selected (not only the loaded ones). */
  allMatching?: boolean | undefined;
  /** Select (true) or stop selecting (false) every matching row. */
  onSelectAllMatching?: ((on: boolean) => void) | undefined;
}

export function DataBulkBar({
  selected,
  totalCount,
  onToggleAll,
  onClearSelection,
  actions,
  className,
  matchingTotal,
  allMatching = false,
  onSelectAllMatching,
}: DataBulkBarProps) {
  const m = useUiMessages();
  if (selected.size === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-3 rounded-lg border bg-muted/50 animate-fade-in",
        className,
      )}
    >
      <Checkbox
        checked={selected.size === totalCount}
        onCheckedChange={onToggleAll}
      />
      <Badge variant="secondary">
        {allMatching && matchingTotal !== undefined
          ? fillMessage(m.bulk.allMatching, { total: matchingTotal.toLocaleString() })
          : fillMessage(m.bulk.selected, { count: selected.size })}
      </Badge>
      {onSelectAllMatching && matchingTotal !== undefined && matchingTotal > totalCount && (allMatching || selected.size === totalCount) ? (
        <Button
          size="sm"
          variant="link"
          className="h-auto px-1"
          aria-pressed={allMatching}
          onClick={() => onSelectAllMatching(!allMatching)}
          data-testid="bulk-select-all-matching"
        >
          {allMatching ? m.common.clear : fillMessage(m.bulk.selectAllMatching, { total: matchingTotal.toLocaleString() })}
        </Button>
      ) : null}
      {actions.map((action) => {
        const ActionIcon = action.icon;
        const button = (
          <Button
            key={action.label}
            size="sm"
            variant={action.variant || "outline"}
            onClick={action.onClick}
            disabled={action.disabled || !!action.reason}
            data-testid={action.testId}
            {...(action.reason ? { "aria-description": action.reason, title: action.reason } : {})}
          >
            <ActionIcon className="h-3.5 w-3.5 mr-1" />
            {action.label}
          </Button>
        );
        // A disabled button gets no pointer events: its reason is on a wrapper that does.
        return action.reason ? (
          <span key={action.label} title={action.reason} className="inline-flex" tabIndex={0} aria-label={`${action.label}: ${action.reason}`}>
            {button}
          </span>
        ) : (
          button
        );
      })}
      <Button
        size="sm"
        variant="ghost"
        onClick={onClearSelection}
        className="ml-auto text-xs text-muted-foreground"
      >
        {m.common.clear}
      </Button>
    </div>
  );
}
