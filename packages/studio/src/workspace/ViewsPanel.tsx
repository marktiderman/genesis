import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@marktiderman/genesis-ui/popover";
import { Bookmark, CalendarDays, ChevronDown, Columns3, Lock, Plus, Search, Table2, X } from "lucide-react";
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
  variant = "card",
}: {
  resources: { name: string; label?: string; access: { update: boolean; reason?: string } }[];
  selected?: string;
  onSelect: (resource: string) => void;
  /** `plain` draws underlined tabs on the page instead of a tinted band. */
  variant?: "card" | "plain";
}) {
  const picker = resources.length > PICKER_AFTER && <AllTables resources={resources} selected={selected} onSelect={onSelect} />;
  if (variant === "plain") {
    return (
      <div className="flex items-end border-b">
      <nav aria-label="Tables" className="flex min-w-0 flex-1 gap-1 overflow-x-auto" data-testid="studio-sidebar">
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
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
                active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label ?? r.name}
              {!r.access.update && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Read-only" />}
            </button>
          );
        })}
      </nav>
      {picker}
      </div>
    );
  }
  return (
    <div className="flex items-end bg-primary/10 pr-2">
    <nav aria-label="Tables" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-2 pt-1.5" data-testid="studio-sidebar">
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
    {picker}
    </div>
  );
}

/** Past this many tables, a searchable list sits at the end of the tabs. */
const PICKER_AFTER = 8;

function AllTables({
  resources,
  selected,
  onSelect,
}: {
  resources: { name: string; label?: string; access: { update: boolean } }[];
  selected?: string;
  onSelect: (resource: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = resources.filter((r) => !q || (r.label ?? r.name).toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mb-1 ml-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          data-testid="studio-all-tables"
        >
          All tables ({resources.length})
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        <div className="relative p-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            aria-label="Find a table"
            placeholder="Find a table"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown[0]) {
                onSelect(shown[0].name);
                setOpen(false);
              }
            }}
            className="h-8 w-full rounded border bg-background pl-7 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto" aria-label="Tables">
          {shown.map((r) => (
            <li key={r.name}>
              <button
                type="button"
                aria-current={r.name === selected ? "page" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                  r.name === selected && "bg-accent text-accent-foreground",
                )}
                onClick={() => {
                  onSelect(r.name);
                  setOpen(false);
                }}
              >
                <span className="truncate">{r.label ?? r.name}</span>
                {!r.access.update && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Read-only" />}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">No table matches.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}


