/**
 * InboxViews — the views rail of a 3-pane inbox: "Mine", "Unassigned", "All
 * open", "Waiting", "Solved", saved views. Each with a count and an icon; the
 * active one is marked `aria-current`. Plain props: the app fills it from its
 * own data, and counts can change live.
 *
 * The default for `InboxLayout`'s `views` pane; an app can put anything there.
 *
 * @stability Beta
 */
import * as React from "react";
import { cn } from "../../../utils";

export interface InboxView {
  id: string;
  label: string;
  /** How many conversations it holds (unread or open, the app decides). Hidden when undefined. */
  count?: number;
  icon?: React.ReactNode;
  /** What the count means, for a screen reader ("3 open"). Default the bare number. */
  countLabel?: string;
}

export interface InboxViewsProps {
  views: readonly InboxView[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  /** Group headings over the views ("Views", "Saved"). */
  sections?: readonly { title: string; ids: readonly string[] }[];
  className?: string;
  testID?: string;
}

export function InboxViews({ views, activeId, onSelect, sections, className, testID = "inbox-views" }: InboxViewsProps) {
  const groups = sections ?? [{ title: "", ids: views.map((v) => v.id) }];
  const byId = new Map(views.map((v) => [v.id, v]));
  return (
    <div data-testid={testID} className={cn("flex flex-col gap-3 p-2", className)}>
      {groups.map((group, g) => (
        <div key={group.title || g} className="flex flex-col">
          {group.title ? <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.title}</h3> : null}
          <ul className="flex flex-col gap-0.5">
            {group.ids.map((id) => {
              const view = byId.get(id);
              if (!view) return null;
              const on = view.id === activeId;
              return (
                <li key={view.id}>
                  <button
                    type="button"
                    data-testid={`${testID}-${view.id}`}
                    aria-current={on ? "page" : undefined}
                    onClick={() => onSelect(view.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {view.icon ? <span className="shrink-0" aria-hidden>{view.icon}</span> : null}
                    <span className="flex-1 truncate">{view.label}</span>
                    {view.count !== undefined ? (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        <span aria-hidden={view.countLabel ? true : undefined}>{view.count}</span>
                        {view.countLabel ? <span className="sr-only">{view.countLabel}</span> : null}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
