import { useState } from "react";
import { ArrowDownUp, Download, EyeOff, Filter, Group, Plus, Search, X } from "lucide-react";
import type { FilterParam, SortParam } from "@marktiderman/genesis-core/provider";
import type { FieldSchema, FilterOperator } from "@marktiderman/genesis-core/schema";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@marktiderman/genesis-ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { needsValue, OPERATOR_LABEL, operatorsFor } from "../lib/query-state";
import { choicesFor, fieldLabel } from "../values";

const NONE = "__genesis_none__";

interface FilterDraft {
  field: string;
  operator: FilterOperator;
  value: string;
}

function toDraft(f: FilterParam): FilterDraft {
  return { field: f.field, operator: f.operator, value: "value" in f && f.value != null ? String(f.value) : "" };
}

function fromDraft(d: FilterDraft): FilterParam {
  return needsValue(d.operator)
    ? ({ field: d.field, operator: d.operator, value: d.value } as FilterParam)
    : ({ field: d.field, operator: d.operator } as FilterParam);
}

/** Filters by field, with the operators that fit each field's type. */
export function FilterBuilder({
  fields,
  filters,
  onChange,
}: {
  fields: readonly FieldSchema[];
  filters: FilterParam[];
  onChange: (filters: FilterParam[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<FilterDraft[]>(filters.map(toDraft));
  const filterable = fields.filter((f) => !f.array);
  const update = (i: number, patch: Partial<FilterDraft>) =>
    setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDrafts(filters.map(toDraft));
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" testID="studio-filter" className={`px-2 ${filters.length ? "bg-success/15" : ""}`}>
          <Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Filter
          {filters.length > 0 && <Badge className="ml-1.5 h-4 px-1.5 text-[10px]">{filters.length}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] space-y-2">
        {drafts.length === 0 && <p className="text-xs text-muted-foreground">No filters. Every row you can see is listed.</p>}
        {drafts.map((d, i) => {
          const field = filterable.find((f) => f.name === d.field);
          const operators = field ? operatorsFor(field) : [];
          const choices = field ? choicesFor(field) : undefined;
          return (
            <div key={i} className="flex flex-wrap items-center gap-1.5" data-testid="studio-filter-row">
              <Select value={d.field} onValueChange={(v) => update(i, { field: v, operator: operatorsFor(filterable.find((f) => f.name === v)!)[0]!, value: "" })}>
                <SelectTrigger className="h-8 w-36 text-xs" aria-label="Field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filterable.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {fieldLabel(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={d.operator} onValueChange={(v) => update(i, { operator: v as FilterOperator })}>
                <SelectTrigger className="h-8 w-40 text-xs" aria-label="Operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op} value={op}>
                      {OPERATOR_LABEL[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsValue(d.operator) &&
                (choices ? (
                  <Select value={d.value || NONE} onValueChange={(v) => update(i, { value: v === NONE ? "" : v })}>
                    <SelectTrigger className="h-8 w-36 text-xs" aria-label="Value">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {choices.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-8 w-36 text-xs"
                    aria-label="Value"
                    type={field?.widget === "date" ? "date" : "text"}
                    value={d.value}
                    onChange={(e) => update(i, { value: e.target.value })}
                  />
                ))}
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove filter" onClick={() => setDrafts((p) => p.filter((_, j) => j !== i))}>
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          );
        })}
        <div className="flex justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filterable.length === 0}
            onClick={() => {
              const first = filterable[0]!;
              setDrafts((p) => [...p, { field: first.name, operator: operatorsFor(first)[0]!, value: "" }]);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Add filter
          </Button>
          <Button
            type="button"
            size="sm"
            testID="studio-filter-apply"
            onClick={() => {
              onChange(drafts.filter((d) => !needsValue(d.operator) || d.value !== "").map(fromDraft));
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Sort by several fields, first one first. */
export function SortBuilder({
  fields,
  sorts,
  onChange,
}: {
  fields: readonly FieldSchema[];
  sorts: SortParam[];
  onChange: (sorts: SortParam[]) => void;
}) {
  const sortable = fields.filter((f) => !f.array);
  const unused = sortable.filter((f) => !sorts.some((s) => s.field === f.name));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" testID="studio-sort" className={`px-2 ${sorts.length ? "bg-warning/20" : ""}`}>
          <ArrowDownUp className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Sort
          {sorts.length > 0 && <Badge className="ml-1.5 h-4 px-1.5 text-[10px]">{sorts.length}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2">
        {sorts.length === 0 && <p className="text-xs text-muted-foreground">Rows are in key order.</p>}
        {sorts.map((s, i) => (
          <div key={s.field} className="flex items-center gap-1.5" data-testid="studio-sort-row">
            <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
            <span className="flex-1 truncate text-sm">{s.field}</span>
            <Select value={s.order} onValueChange={(v) => onChange(sorts.map((x, j) => (j === i ? { ...x, order: v as "asc" | "desc" } : x)))}>
              <SelectTrigger className="h-8 w-28 text-xs" aria-label={`Direction for ${s.field}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Stop sorting by ${s.field}`} onClick={() => onChange(sorts.filter((_, j) => j !== i))}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        ))}
        {unused.length > 0 && sorts.length < 5 && (
          <Select value={NONE} onValueChange={(v) => v !== NONE && onChange([...sorts, { field: v, order: "asc" }])}>
            <SelectTrigger className="h-8 text-xs" aria-label="Add a sort field">
              <SelectValue placeholder="Add a sort field" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} disabled>
                Add a sort field…
              </SelectItem>
              {unused.map((f) => (
                <SelectItem key={f.name} value={f.name}>
                  {fieldLabel(f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Group rows by a field with few distinct values. */
export function GroupPicker({
  fields,
  group,
  onChange,
}: {
  fields: readonly FieldSchema[];
  group: string | undefined;
  onChange: (group: string | undefined) => void;
}) {
  const groupable = fields.filter((f) => !f.array && f.type !== "json");
  return (
    <Select value={group ?? NONE} onValueChange={(v) => onChange(v === NONE ? undefined : v)}>
      <SelectTrigger className={`h-8 w-auto gap-1.5 border-0 text-sm shadow-none hover:bg-muted ${group ? "bg-info/15" : ""}`} aria-label="Group by" data-testid="studio-group">
        <Group className="h-3.5 w-3.5" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Group</SelectItem>
        {groupable.map((f) => (
          <SelectItem key={f.name} value={f.name}>
            Group by {fieldLabel(f)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ExportButton({ onExport, busy, progress }: { onExport: () => void; busy: boolean; progress: number }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onExport} disabled={busy} testID="studio-export" aria-label="Export CSV" title="Export CSV">
      <Download className="h-3.5 w-3.5" aria-hidden />
      {busy && <span className="ml-1.5">{progress}</span>}
    </Button>
  );
}

export function NewRowButton({ allowed, reason, onClick }: { allowed: boolean; reason?: string; onClick: () => void }) {
  return (
    <Button type="button" size="sm" onClick={onClick} disabled={!allowed} title={allowed ? undefined : reason} testID="studio-new-row">
      <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
      Add record
    </Button>
  );
}

export type ViewKind = "table" | "sheet" | "kanban" | "calendar";
const VIEW_LABEL: Record<ViewKind, string> = { table: "Table", sheet: "Sheet", kanban: "Board", calendar: "Calendar" };
const VIEW_UNAVAILABLE: Partial<Record<ViewKind, string>> = {
  kanban: "A board needs a field with a fixed set of values, like an enum.",
  calendar: "A calendar needs a date or timestamp field.",
};

/** Switch between the table, the spreadsheet grid, a board and a calendar. */
export function ViewSwitch({
  view,
  onChange,
  available = { table: true, sheet: true },
}: {
  view: ViewKind;
  onChange: (view: ViewKind) => void;
  /** Views this table can show. A board and a calendar each need a fitting field. */
  available?: Partial<Record<ViewKind, boolean>>;
}) {
  return (
    <div role="group" aria-label="View" className="inline-flex rounded-md border p-0.5" data-testid="studio-view-switch">
      {(["table", "sheet", "kanban", "calendar"] as const)
        .filter((v) => v === "table" || v === "sheet" || available[v] !== undefined)
        .map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            disabled={available[v] === false}
            title={available[v] === false ? VIEW_UNAVAILABLE[v] : undefined}
            onClick={() => onChange(v)}
            className={`rounded px-2 py-1 text-xs disabled:opacity-40 ${view === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
    </div>
  );
}

/** Which field lays out the board or the calendar. */
export function ViewFieldPicker({
  label,
  fields,
  value,
  onChange,
}: {
  label: string;
  fields: readonly FieldSchema[];
  value: string;
  onChange: (field: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto gap-1.5 text-sm" aria-label={label} data-testid="studio-view-field">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fields.map((f) => (
          <SelectItem key={f.name} value={f.name}>
            {label} {fieldLabel(f)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Which fields the grid shows. */
export function HideFields({
  fields,
  hidden,
  onChange,
}: {
  fields: readonly FieldSchema[];
  hidden: ReadonlySet<string>;
  onChange: (hidden: Set<string>) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="px-2" testID="studio-hide-fields">
          <EyeOff className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {hidden.size ? `${hidden.size} hidden field${hidden.size === 1 ? "" : "s"}` : "Hide fields"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-1 p-2">
        {fields.map((f) => (
          <label key={f.name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={!hidden.has(f.name)}
              onChange={() => {
                const next = new Set(hidden);
                if (next.has(f.name)) next.delete(f.name);
                else next.add(f.name);
                onChange(next);
              }}
            />
            <span className="truncate">{fieldLabel(f)}</span>
          </label>
        ))}
        {hidden.size > 0 && (
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onChange(new Set())}>
            Show all
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Search every text field, as you type. */
export function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        aria-label="Search"
        placeholder="Search"
        className="h-8 w-36 pl-7 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="studio-search"
      />
    </div>
  );
}
