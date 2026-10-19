import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, X } from "lucide-react";
import type { BaseRecord, DataProvider } from "@marktiderman/genesis-core/provider";
import type { FieldSchema } from "@marktiderman/genesis-core/schema";
import { Button } from "@marktiderman/genesis-ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@marktiderman/genesis-ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@marktiderman/genesis-ui/command";
import { useSchema } from "../lib/relations";
import { displayText } from "../values";

export interface RelationPickerProps {
  provider: DataProvider;
  sessionKey: unknown;
  field: FieldSchema;
  /** The linked row's key, as text ("" for none). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

/**
 * Pick a linked row by searching the target resource on the server, so it
 * works for a table of any size; shows each row by its label field.
 */
export function RelationPicker({ provider, sessionKey, field, value, onChange, disabled, id }: RelationPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const target = field.references!.resource;
  const targetField = field.references!.field;
  const schema = useSchema(provider, sessionKey, target);
  const labelField = schema.data?.labelField ?? targetField;

  const options = useQuery({
    queryKey: ["genesis-studio", sessionKey, "pick", target, search],
    enabled: open && Boolean(schema.data),
    retry: false,
    queryFn: () =>
      provider.getList<BaseRecord>(target, {
        pagination: { page: 1, perPage: 20 },
        ...(search ? { search: { query: search, fields: [] } } : {}),
      }),
  });
  const current = useQuery({
    queryKey: ["genesis-studio", sessionKey, "labels", target, targetField, [value]],
    enabled: Boolean(value && schema.data),
    retry: false,
    queryFn: async () => {
      const result = await provider.getList<BaseRecord>(target, {
        pagination: { page: 1, perPage: 1 },
        filters: [{ field: targetField, operator: "eq", value }],
      });
      const row = result.data[0] as Record<string, unknown> | undefined;
      return new Map(row ? [[value, displayText(row[labelField]) ?? value]] : []);
    },
  });
  const label = value ? (current.data?.get(value) ?? value) : "—";

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-9 w-full justify-between font-normal"
            testID={`studio-picker-${field.name}`}
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={`Search ${target}…`} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{options.isLoading ? "Searching…" : "No matches you can see."}</CommandEmpty>
              {(options.data?.data as Record<string, unknown>[] | undefined)?.map((row) => {
                const key = String(row[targetField]);
                return (
                  <CommandItem
                    key={key}
                    value={key}
                    onSelect={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{displayText(row[labelField]) ?? key}</span>
                    <span className="ml-auto pl-2 font-mono text-[10px] text-muted-foreground">{key}</span>
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && field.nullable && !disabled && (
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={`Clear ${field.name}`} onClick={() => onChange("")}>
          <X className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}
