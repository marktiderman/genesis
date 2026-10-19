import { useState } from "react";
import { Bookmark, CalendarDays, Columns3, Lock, Plus, Table2, X } from "lucide-react";
import type { SavedViewItem } from "@marktiderman/genesis-ui/data";
import { cn } from "@marktiderman/genesis-ui/utils";

export type StudioViewKind = "grid" | "kanban" | "calendar";

const VIEWS: { kind: StudioViewKind; label: string; icon: typeof Table2; unavailable: string }[] = [
  { kind: "grid", label: "Grid", icon: Table2, unavailable: "" },
  { kind: "kanban", label: "Board", icon: Columns3, unavailable: "A board needs a field with a fixed set of values, like a status." },
  { kind: "calendar", label: "Calendar", icon: CalendarDays, unavailable: "A calendar needs a date field." },
];

/** The left column: how to look at this table, and the views you've saved. */
export function ViewsPanel({
  view,
  available,
  onChange,
  saved,
  onLoad,
  onDelete,
  onSave,
}: {
  view: StudioViewKind;
  available: Record<StudioViewKind, boolean>;
  onChange: (view: StudioViewKind) => void;
  saved: SavedViewItem[];
  onLoad: (view: SavedViewItem) => void;
  onDelete: (id: string) => void;
  onSave: (name: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  return (
    <nav
      aria-label="Views"
      className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b p-2 text-sm md:w-40 md:flex-col md:overflow-visible md:border-b-0 md:border-r"
      data-testid="studio-views"
    >
      <p className="hidden px-2 pb-1 text-xs text-muted-foreground md:block">Views</p>
      {VIEWS.map(({ kind, label, icon: Icon, unavailable }) => (
        <button
          key={kind}
          type="button"
          aria-pressed={view === kind}
          disabled={!available[kind]}
          title={available[kind] ? undefined : unavailable}
          onClick={() => onChange(kind)}
          data-testid={`studio-view-${kind}`}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left disabled:opacity-40",
            view === kind ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          {label}
        </button>
      ))}
      {saved.length > 0 && <p className="hidden px-2 pb-1 pt-3 text-xs text-muted-foreground md:block">Saved</p>}
      {saved.map((item) => (
        <span key={item.id} className="group flex shrink-0 items-center rounded-md hover:bg-muted">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-muted-foreground hover:text-foreground"
            onClick={() => onLoad(item)}
            data-testid="studio-saved-view"
          >
            <Bookmark className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{item.name}</span>
          </button>
          <button
            type="button"
            aria-label={`Delete view ${item.name}`}
            className="mr-1 rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            onClick={() => onDelete(item.id)}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      {naming ? (
        <form
          className="flex shrink-0 items-center gap-1 px-1 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSave(name.trim());
            setName("");
            setNaming(false);
          }}
        >
          <input
            autoFocus
            aria-label="View name"
            placeholder="View name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
            className="h-7 w-full min-w-24 rounded border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </form>
      ) : (
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground md:mt-2"
          onClick={() => setNaming(true)}
          data-testid="studio-save-view"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Save view
        </button>
      )}
    </nav>
  );
}

/** Table tabs across the top, as Airtable shows a base's tables. */
export function TableTabs({
  resources,
  selected,
  onSelect,
}: {
  resources: { name: string; label?: string; access: { update: boolean; reason?: string } }[];
  selected?: string;
  onSelect: (resource: string) => void;
}) {
  return (
    <nav aria-label="Tables" className="flex gap-0.5 overflow-x-auto bg-primary/10 px-2 pt-1.5" data-testid="studio-sidebar">
      {resources.map((r) => {
        const active = r.name === selected;
        return (
          <button
            key={r.name}
            type="button"
            onClick={() => onSelect(r.name)}
            aria-current={active ? "page" : undefined}
            title={r.access.update ? r.name : `${r.name}: ${r.access.reason ?? "read-only"}`}
            data-testid={`studio-table-${r.name}`}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-1.5 text-sm",
              active ? "bg-background font-medium text-foreground" : "text-foreground/70 hover:bg-background/60 hover:text-foreground",
            )}
          >
            {r.label ?? r.name}
            {!r.access.update && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Read-only" />}
          </button>
        );
      })}
    </nav>
  );
}

