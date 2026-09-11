import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils";

/**
 * One button in the bulk action bar.
 *
 * @stability Stable
 */
export interface BulkAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
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
  disabled?: boolean;
  /**
   * `data-testid` on the rendered button.
   *
   * Without it, a consumer migrating a hand-rolled bulk bar to `DataBulkBar`
   * loses every selector its e2e suite uses to drive one — which is a real
   * reason not to migrate, and the kind of small missing affordance that
   * keeps a parallel implementation alive.
   */
  testId?: string;
}

export interface DataBulkBarProps {
  selected: Set<string>;
  totalCount: number;
  onToggleAll: () => void;
  onClearSelection: () => void;
  actions: BulkAction[];
  /** Merged onto the bar, not replacing its positioning. */
  className?: string;
}

export function DataBulkBar({
  selected,
  totalCount,
  onToggleAll,
  onClearSelection,
  actions,
  className,
}: DataBulkBarProps) {
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
      <Badge variant="secondary">{selected.size} selected</Badge>
      {actions.map((action) => {
        const ActionIcon = action.icon;
        return (
          <Button
            key={action.label}
            size="sm"
            variant={action.variant || "outline"}
            onClick={action.onClick}
            disabled={action.disabled}
            data-testid={action.testId}
          >
            <ActionIcon className="h-3.5 w-3.5 mr-1" />
            {action.label}
          </Button>
        );
      })}
      <Button
        size="sm"
        variant="ghost"
        onClick={onClearSelection}
        className="ml-auto text-xs text-muted-foreground"
      >
        Clear
      </Button>
    </div>
  );
}
