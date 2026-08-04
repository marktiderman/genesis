"use client";

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "../../utils";
import { useResource } from "@marktiderman/genesis-core/hooks";
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
import type { ResourceFormFieldDef } from "./ResourceFormField";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RelationFieldProps {
  field: ResourceFormFieldDef;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RelationField({
  field,
  value,
  onChange,
  disabled,
}: RelationFieldProps) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createValue, setCreateValue] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [extraOptions, setExtraOptions] = useState<{ value: string; label: string }[]>([]);
  const relation = field.relation!;
  const valueField = relation.valueField ?? "id";
  const provider = useDataProvider();

  const { list } = useResource(relation.resource, {
    defaultPerPage: 100,
  });

  const options = useMemo(() => {
    const base = list.data?.data
      ? list.data.data.map((item) => {
          const record = item as Record<string, unknown>;
          return {
            value: String(record[valueField] ?? ""),
            label: String(record[relation.labelField] ?? ""),
          };
        })
      : [];
    return [...base, ...extraOptions];
  }, [list.data?.data, valueField, relation.labelField, extraOptions]);

  const handleCreate = async () => {
    if (!createValue.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const res = await provider.create<BaseRecord>(relation.resource, {
        data: { [relation.labelField]: createValue.trim() },
      });
      const record = res.data;
      const newValue = String(record[valueField] ?? "");
      const newLabel = String(record[relation.labelField] ?? "");
      setExtraOptions((prev) => [...prev, { value: newValue, label: newLabel }]);
      onChange(newValue);
      setCreateOpen(false);
      setCreateValue("");
    } catch (err) {
      console.error(`Failed to create ${relation.resource}:`, err);
      setCreateError(err instanceof Error ? err.message : "Failed to create record");
    } finally {
      setIsCreating(false);
    }
  };

  const showSearch =
    relation.searchable ?? options.length > 10;

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    const match = options.find((opt) => opt.value === value);
    return match?.label ?? null;
  }, [value, options]);

  const isLoading = list.isLoading;

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </span>
          ) : selectedLabel ? (
            selectedLabel
          ) : (
            <span className="text-muted-foreground">
              {field.placeholder ?? "Select..."}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          {showSearch && <CommandInput placeholder="Search..." />}
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.value === value ? "" : opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {relation.allowCreate && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      setCreateOpen(true);
                    }}
                  >
                    + Create new...
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
            <DialogTitle>Create new {relation.resource.replace(/s$/, "")}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={`Enter ${relation.labelField}...`}
            value={createValue}
            onChange={(e) => { setCreateValue(e.target.value); setCreateError(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
            autoFocus
          />
          {createError && (
            <p className="text-sm text-destructive">{createError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={isCreating || !createValue.trim()}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
