"use client";

// Tree mode's only markup: a row's indent and its expand arrow, in the first cell of a table row
// or at the start of a list row. The tree itself (order, depth, open state) is genesis-core's
// `treeRows`, run by `useResourceView`; see docs/RESOURCE-VIEW.md, "Tree mode".

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TreeNode } from "@marktiderman/genesis-core/resource-view";
import { cn } from "../../utils";
import { fillMessage, useUiMessages } from "../../messages";

/** One indent step per level of depth. */
const STEP_REM = 1.25;

export interface TreeIndentProps {
  node: Pick<TreeNode<unknown>, "depth" | "hasChildren" | "expanded">;
  /** The row's name, for the arrow's label ("Expand North"). */
  name: string;
  onToggle: (open: boolean) => void;
  /**
   * Whether the arrow is a tab stop. A table whose rows take ← and → leaves it out of the tab
   * order (the row's keys do its job); a list without row keys keeps it in.
   */
  focusable?: boolean;
  className?: string;
  children: ReactNode;
}

/** The indent for a row's depth, its expand arrow (or a spacer for a leaf), then the row's content. */
export function TreeIndent({ node, name, onToggle, focusable = true, className, children }: TreeIndentProps) {
  const m = useUiMessages();
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)} style={{ paddingInlineStart: `${node.depth * STEP_REM}rem` }}>
      {node.hasChildren ? (
        <button
          type="button"
          data-tree-toggle=""
          tabIndex={focusable ? 0 : -1}
          aria-label={fillMessage(node.expanded ? m.table.collapseRow : m.table.expandRow, { name })}
          aria-expanded={node.expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(!node.expanded);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {node.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <span aria-hidden className="inline-block h-5 w-5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
