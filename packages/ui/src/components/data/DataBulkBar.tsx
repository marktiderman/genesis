import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { LucideIcon } from "lucide-react";

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
}

interface DataBulkBarProps {
  selected: Set<string>;
  totalCount: number;
  onToggleAll: () => void;
  onClearSelection: () => void;
  actions: BulkAction[];
}

export function DataBulkBar({
  selected,
  totalCount,
  onToggleAll,
  onClearSelection,
  actions,
}: DataBulkBarProps) {
  if (selected.size === 0) return null;

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/50 animate-fade-in">
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
