"use client";

// A link's picker in a form (docs/RESOURCE-VIEW.md, "Links in forms"): a searchable select over the
// linked resource, listed through the data provider (row-level security, plus the filters the
// field carries: the linked view's scope and default filter), searched and paged on the server
// with useLinkOptions. It shows the linked row's words and stores its key. An optional link has a
// None choice, which stores null.

import { useEffect, useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "../../utils";
import { useLinkOptions, useRelationLabel } from "@marktiderman/genesis-core/hooks";
import { useDataProvider, type BaseRecord } from "@marktiderman/genesis-core/provider";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useUiMessages } from "../../messages";
import type { ResourceFormFieldDef } from "./ResourceFormField";
import { NONE_CHOICE as NONE } from "./none-choice";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RelationFieldBaseProps {
  field: ResourceFormFieldDef;
  disabled?: boolean | undefined;
  /** The form's values, for a picker whose filters follow another field. */
  values?: Readonly<Record<string, unknown>> | undefined;
  /** Id for the trigger, so a `<label htmlFor>` names it. */
  id?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
  "aria-required"?: boolean | undefined;
}

/** Keys as text, as RelationField always gave them: the key as a string, `""` for none. */
export interface RelationFieldTextKeyProps extends RelationFieldBaseProps {
  value: string;
  onChange: (value: string) => void;
  keys?: "text" | undefined;
}

/** Keys as the row holds them (a number stays a number), `null` for None. What a view's link uses. */
export interface RelationFieldRowKeyProps extends RelationFieldBaseProps {
  /** The linked row's key (text or a number), or empty. */
  value: unknown;
  /** The picked row's key as the row holds it; `null` when None is chosen. */
  onChange: (value: string | number | null) => void;
  keys: "row";
}

export type RelationFieldProps = RelationFieldTextKeyProps | RelationFieldRowKeyProps;

/** How long typing settles before the search goes to the server. */
const SEARCH_DEBOUNCE_MS = 250;
const MORE = "__genesis_link_more__";
const CREATE = "__genesis_link_create__";

const empty = (value: unknown) => value === null || value === undefined || value === "";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RelationField(props: RelationFieldProps) {
  const {
    field,
    value,
    disabled,
    values,
    id,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    "aria-required": ariaRequired,
  } = props;
  // A text-key caller gets what it always did: the key as a string, "" for none.
  const onChange = (next: string | number | null) => {
    if (props.keys === "row") props.onChange(next);
    else props.onChange(next === null ? "" : String(next));
  };
  const messages = useUiMessages();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createValue, setCreateValue] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState<{ value: string | number; label: string }[]>([]);
  const relation = field.relation!;
  const valueField = relation.valueField ?? "id";
  const provider = useDataProvider();

  // The search goes to the server once typing settles.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // By value: a form re-renders on every keystroke, and its filters are one list per value.
  const filterSource = relation.filters;
  const filters = typeof filterSource === "function" ? filterSource(values ?? {}) : filterSource;
  const filtersKey = JSON.stringify(filters ?? []);
  const stableFilters = useMemo(() => JSON.parse(filtersKey) as typeof filters, [filtersKey]);

  // Nothing is asked for until the picker opens: a closed form costs one label lookup at most.
  const list = useLinkOptions(
    {
      resource: relation.resource,
      field: valueField,
      labelField: relation.labelField,
      searchFields: relation.searchFields,
    },
    { filters: stableFilters, search, enabled: open, untitled: messages.common.untitled },
  );

  const options = useMemo(() => {
    const seen = new Set(list.options.map((o) => String(o.value)));
    return [...list.options, ...created.filter((o) => !seen.has(String(o.value)))];
  }, [list.options, created]);

  // The chosen row's words: from the loaded rows, else one batched lookup (it may be on a page not
  // loaded, or outside the search). Never the raw id.
  const loaded = empty(value) ? undefined : options.find((o) => String(o.value) === String(value));
  const looked = useRelationLabel(
    { resource: relation.resource, field: valueField },
    value,
    { ...(list.labelField ?? relation.labelField ? { labelField: (list.labelField ?? relation.labelField)! } : {}), enabled: !empty(value) && !loaded },
  );
  const chosen = empty(value)
    ? null
    : (loaded?.label ?? (looked === undefined ? undefined : (looked ?? relation.missingLabel ?? messages.common.hiddenLink)));

  const showSearch = relation.searchable ?? (list.searchable && (list.hasMore || options.length > 10 || query !== ""));
  const optional = !field.required;

  const pick = (next: string | number | null) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const handleCreate = async () => {
    const labelField = list.labelField ?? relation.labelField;
    if (!labelField || !createValue.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const res = await provider.create<BaseRecord>(relation.resource, {
        data: { [labelField]: createValue.trim() },
      });
      const record = res.data as Record<string, unknown>;
      const key = record[valueField];
      if (typeof key === "string" || typeof key === "number") {
        setCreated((prev) => [...prev, { value: key, label: String(record[labelField] ?? key) }]);
        onChange(key);
      }
      setCreateOpen(false);
      setCreateValue("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : messages.page.errorTitle);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          {/* A button that opens a listbox: the search input inside is the only combobox. */}
          <Button
            variant="outline"
            id={id}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? listId : undefined}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            aria-required={ariaRequired}
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            {chosen === undefined ? (
              <span className="flex items-center gap-2 text-muted-foreground" aria-busy="true">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {messages.common.loading}
              </span>
            ) : chosen ? (
              <span className="truncate">{chosen}</span>
            ) : (
              <span className="text-muted-foreground">{field.placeholder ?? messages.link.placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {/* The server searches; cmdk only keeps the active option and the keys. */}
          <Command shouldFilter={false} {...(field.label ? { label: field.label } : {})}>
            {showSearch && (
              <CommandInput
                placeholder={messages.link.search}
                value={query}
                onValueChange={setQuery}
                aria-label={messages.link.search}
              />
            )}
            <CommandList id={listId} aria-busy={list.isLoading || undefined}>
              {list.isLoading ? (
                <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {messages.common.loading}
                </div>
              ) : list.isError ? (
                <div className="px-3 py-6 text-sm text-destructive" role="alert">
                  {messages.link.loadFailed}
                </div>
              ) : (
                <CommandEmpty>{messages.link.noResults}</CommandEmpty>
              )}
              <CommandGroup>
                {optional && !list.isLoading && query === "" && (
                  <CommandItem value={NONE} onSelect={() => pick(null)}>
                    <Check className={cn("mr-2 h-4 w-4", empty(value) ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                    <span className="text-muted-foreground">{messages.link.none}</span>
                    {empty(value) && <span className="sr-only">, {messages.link.selected}</span>}
                  </CommandItem>
                )}
                {options.map((opt) => {
                  const selected = !empty(value) && String(value) === String(opt.value);
                  return (
                    <CommandItem
                      key={String(opt.value)}
                      value={`${typeof opt.value}:${String(opt.value)}`}
                      data-checked={selected || undefined}
                      onSelect={() => pick(opt.value)}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                      {opt.label}
                      {selected && <span className="sr-only">, {messages.link.selected}</span>}
                    </CommandItem>
                  );
                })}
                {list.hasMore && (
                  <CommandItem value={MORE} onSelect={() => list.loadMore()} disabled={list.isLoadingMore}>
                    {list.isLoadingMore ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <span className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {messages.link.loadMore}
                  </CommandItem>
                )}
              </CommandGroup>
              {relation.allowCreate && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value={CREATE}
                      onSelect={() => {
                        setOpen(false);
                        setCreateOpen(true);
                      }}
                    >
                      {messages.link.createNew}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {relation.allowCreate && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>{field.label ?? messages.link.createNew}</DialogTitle>
            </DialogHeader>
            <Input
              aria-label={field.label ?? messages.link.createNew}
              value={createValue}
              onChange={(e) => {
                setCreateValue(e.target.value);
                setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              autoFocus
            />
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isCreating}>
                {messages.common.cancel}
              </Button>
              <Button onClick={() => void handleCreate()} disabled={isCreating || !createValue.trim()}>
                {isCreating ? messages.common.saving : messages.common.save}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
