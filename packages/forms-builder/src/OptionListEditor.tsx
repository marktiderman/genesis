import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Download, Plus, Trash2, Upload } from "lucide-react";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";
import type { ChoiceOption } from "@marktiderman/genesis-forms";
import {
  ATTRIBUTE_VALUE_SEPARATOR,
  mergeOptions,
  optionListCsv,
  parseOptionListCsv,
  slugOptionValue,
  type OptionList,
  type OptionListImport,
} from "./option-lists";

export interface OptionListEditorProps {
  /** The list being edited. The editor holds no copy: every change comes back through `onChange`. */
  list: OptionList;
  /** Called with the whole list after each change. Saving it is the host's job. */
  onChange: (list: OptionList) => void;
  /** Look only: no editing, importing or reordering; export still works. */
  readOnly?: boolean | undefined;
  className?: string | undefined;
  testID?: string | undefined;
}

/** A value for a new option, made from its label and unused in the list. */
function freshValue(label: string, options: readonly ChoiceOption[]): string {
  const base = slugOptionValue(label) || "option";
  const taken = new Set(options.map((o) => o.value));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** The attribute names the options carry, in the order they first appear. */
function attributeNames(options: readonly ChoiceOption[]): string[] {
  const names: string[] = [];
  for (const o of options) for (const n of Object.keys(o.attributes ?? {})) if (!names.includes(n)) names.push(n);
  return names;
}

/** An option with one detail set, or removed when `text` is blank. */
function withDetail(o: ChoiceOption, key: "label" | "description" | "image", text: string): ChoiceOption {
  const next: Record<string, unknown> = { ...o, [key]: text };
  if (text === "" && key !== "label") delete next[key];
  return next as unknown as ChoiceOption;
}

/** An option with one attribute set from its text (`a|b` is a list), or removed when blank. */
function withAttribute(o: ChoiceOption, name: string, text: string): ChoiceOption {
  const attributes = { ...o.attributes };
  const parts = text.split(ATTRIBUTE_VALUE_SEPARATOR).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) delete attributes[name];
  else attributes[name] = text.includes(ATTRIBUTE_VALUE_SEPARATOR) ? parts : parts[0]!;
  const { attributes: _old, ...rest } = o;
  return Object.keys(attributes).length ? { ...rest, attributes } : rest;
}

/** Offer `text` as a file named `name` (a CSV export). */
function download(name: string, text: string) {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Edit a named option list a host keeps, such as a practice's "Locations": rename it; add,
 * remove and reorder options; edit each one's label, description, picture and attributes; import
 * from pasted CSV or a file with a preview of what will change (`parseOptionListCsv`, then
 * `mergeOptions`); and export it as CSV. An option's value is what answers store, so it is made
 * once from its label and then only shown.
 */
export function OptionListEditor({ list, onChange, readOnly, className, testID }: OptionListEditorProps) {
  const id = useId();
  const [extraAttributes, setExtraAttributes] = useState<string[]>([]);
  const [newAttribute, setNewAttribute] = useState("");
  const [pasted, setPasted] = useState("");
  const [preview, setPreview] = useState<OptionListImport | null>(null);
  const options = list.options;
  const names = [...attributeNames(options), ...extraAttributes.filter((n) => !attributeNames(options).includes(n))];
  const setOptions = (next: ChoiceOption[]) => onChange({ ...list, options: next });
  const update = (i: number, o: ChoiceOption) => setOptions(options.map((x, j) => (j === i ? o : x)));
  const move = (i: number, by: number) => {
    const next = [...options];
    const [o] = next.splice(i, 1);
    next.splice(i + by, 0, o!);
    setOptions(next);
  };
  const add = () => setOptions([...options, { value: freshValue("New option", options), label: "New option" }]);
  const addAttribute = () => {
    const name = newAttribute.trim();
    if (!name || names.includes(name) || name in Object.prototype) return;
    setExtraAttributes([...extraAttributes, name]);
    setNewAttribute("");
  };
  const merged = preview ? mergeOptions(options, preview.options) : options;
  const updated = preview ? preview.options.filter((o) => options.some((x) => x.value === o.value)).length : 0;
  const added = preview ? preview.options.length - updated : 0;
  const skipped = preview ? preview.rows.filter((r) => r.problems.length) : [];

  return (
    <div className={cn("space-y-6", className)} data-testid={testID ?? "option-list-editor"}>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>List name</Label>
        <Input
          id={`${id}-name`}
          value={list.label}
          disabled={readOnly}
          data-testid="option-list-name"
          onChange={(e) => onChange({ ...list, label: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Forms use this list by its key, <code>{list.key}</code>, which stays the same when you rename it.
        </p>
      </div>

      <section className="space-y-3" aria-labelledby={`${id}-options`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${id}-options`} className="text-sm font-medium">
            Options <Badge variant="secondary">{options.length}</Badge>
          </h3>
          <Button
            variant="outline"
            size="sm"
            data-testid="option-list-export"
            onClick={() => download(`${list.key || "options"}.csv`, optionListCsv(options))}
          >
            <Download aria-hidden="true" /> Export CSV
          </Button>
        </div>
        {options.length === 0 ? <p className="text-sm text-muted-foreground">No options yet.</p> : null}
        <ol className="space-y-3">
          {options.map((o, i) => {
            const row = `${id}-${i}`;
            const name = o.label || o.value;
            return (
              <li key={o.value} className="space-y-2 rounded-md border p-3" data-testid={`option-list-row-${i}`}>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label htmlFor={`${row}-label`} className="text-xs">
                      Label
                    </Label>
                    <Input
                      id={`${row}-label`}
                      value={o.label ?? ""}
                      disabled={readOnly}
                      data-testid={`option-list-label-${i}`}
                      onChange={(e) => update(i, withDetail(o, "label", e.target.value))}
                    />
                  </div>
                  <code className="pb-2 text-xs text-muted-foreground" title="Answers store this value">
                    {o.value}
                  </code>
                  {readOnly ? null : (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${name} down`}
                        disabled={i === options.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${name}`}
                        data-testid={`option-list-remove-${i}`}
                        onClick={() => setOptions(options.filter((_, j) => j !== i))}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${row}-description`} className="text-xs">
                      Description
                    </Label>
                    <Input
                      id={`${row}-description`}
                      value={o.description ?? ""}
                      disabled={readOnly}
                      onChange={(e) => update(i, withDetail(o, "description", e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${row}-image`} className="text-xs">
                      Picture (https:// link)
                    </Label>
                    <Input
                      id={`${row}-image`}
                      type="url"
                      inputMode="url"
                      value={o.image ?? ""}
                      disabled={readOnly}
                      aria-invalid={o.image && !/^https:\/\//i.test(o.image) ? true : undefined}
                      onChange={(e) => update(i, withDetail(o, "image", e.target.value.trim()))}
                    />
                  </div>
                  {names.map((n) => {
                    const v = o.attributes?.[n];
                    return (
                      <div key={n} className="space-y-1">
                        <Label htmlFor={`${row}-attr-${n}`} className="text-xs">
                          {n}
                        </Label>
                        <Input
                          id={`${row}-attr-${n}`}
                          value={Array.isArray(v) ? v.join(ATTRIBUTE_VALUE_SEPARATOR) : (v ?? "")}
                          disabled={readOnly}
                          data-testid={`option-list-attr-${i}-${n}`}
                          onChange={(e) => update(i, withAttribute(o, n, e.target.value))}
                        />
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
        {readOnly ? null : (
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="outline" size="sm" data-testid="option-list-add" onClick={add}>
              <Plus aria-hidden="true" /> Add option
            </Button>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={`${id}-attribute`} className="text-xs">
                  New attribute
                </Label>
                <Input
                  id={`${id}-attribute`}
                  value={newAttribute}
                  placeholder="location"
                  className="h-9 w-40"
                  onChange={(e) => setNewAttribute(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAttribute();
                    }
                  }}
                />
              </div>
              <Button variant="outline" size="sm" data-testid="option-list-add-attribute" onClick={addAttribute}>
                Add attribute
              </Button>
            </div>
          </div>
        )}
        {names.length ? (
          <p className="text-xs text-muted-foreground">
            Attributes let a form show only matching options. Separate several values with {ATTRIBUTE_VALUE_SEPARATOR}.
          </p>
        ) : null}
      </section>

      {readOnly ? null : (
        <section className="space-y-3" aria-labelledby={`${id}-import`}>
          <h3 id={`${id}-import`} className="text-sm font-medium">
            Import
          </h3>
          <p className="text-xs text-muted-foreground">
            Paste rows from a spreadsheet or a CSV file with a header: value, label, description, image, then any
            attributes. A single column of names works too. Options with a value already in the list are updated;
            nothing is removed.
          </p>
          <Label htmlFor={`${id}-paste`} className="sr-only">
            Paste CSV
          </Label>
          <Textarea
            id={`${id}-paste`}
            rows={4}
            value={pasted}
            placeholder={"value,label,description\ncff,CrossFit Fairfield,12 Main St"}
            data-testid="option-list-paste"
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!pasted.trim()}
              data-testid="option-list-preview"
              onClick={() => setPreview(parseOptionListCsv(pasted))}
            >
              Preview
            </Button>
            <Label htmlFor={`${id}-file`} className="text-sm">
              <Upload aria-hidden="true" className="mr-1 inline size-4" />
              Or choose a file
            </Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="h-9 w-auto max-w-full"
              data-testid="option-list-file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setPasted(text);
                setPreview(parseOptionListCsv(text));
              }}
            />
          </div>
          {preview ? (
            <div className="space-y-2 rounded-md border p-3" role="status" data-testid="option-list-import-preview">
              <p className="text-sm">
                {added} new, {updated} updated
                {skipped.length ? `, ${skipped.length} left out` : ""}.
              </p>
              {preview.problems.map((p) => (
                <p key={p} className="text-sm text-destructive">
                  {p}
                </p>
              ))}
              {skipped.length ? (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                  {skipped.map((r) => (
                    <li key={r.line}>
                      Line {r.line}: {r.problems.join(" ")}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={merged === options}
                  data-testid="option-list-import"
                  onClick={() => {
                    setOptions(merged);
                    setPreview(null);
                    setPasted("");
                  }}
                >
                  Import {preview.options.length} {preview.options.length === 1 ? "option" : "options"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
