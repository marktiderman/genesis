/**
 * Puck's chrome, drawn with Genesis UI: every field type, field labels, and
 * the Add picker's items (which also enforce each section's limit). So the
 * editor reads as part of the host app, not as stock Puck, and every
 * control has a real label.
 */
import * as React from "react";
import { createUsePuck, type Overrides } from "@puckeditor/core";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { RadioGroup, RadioGroupItem } from "@marktiderman/genesis-ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";
import { newSectionId } from "../core/registry";
import { scrollCanvasTo } from "./canvas-dom";
import { countTypes, sectionTypeOf, type EditorData } from "./data";
import type { ComponentInfo } from "./config";

const usePuck = createUsePuck();

interface BaseProps {
  field: { label?: string; placeholder?: string; options?: readonly { label: string; value: unknown }[]; min?: number; max?: number; step?: number; metadata?: unknown };
  name: string;
  id?: string;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
}

const fieldId = (p: BaseProps) => p.id ?? `gs-field-${p.name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

function FieldShell({ id, label, children }: { id: string; label?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      {children}
    </div>
  );
}

function TextInput(p: BaseProps) {
  const id = fieldId(p);
  return (
    <FieldShell id={id} label={p.field.label}>
      <Input id={id} name={p.name} value={typeof p.value === "string" ? p.value : ""} placeholder={p.field.placeholder} disabled={p.readOnly} onChange={(e) => p.onChange(e.currentTarget.value)} />
    </FieldShell>
  );
}

function TextareaInput(p: BaseProps) {
  const id = fieldId(p);
  return (
    <FieldShell id={id} label={p.field.label}>
      <Textarea id={id} name={p.name} rows={3} value={typeof p.value === "string" ? p.value : ""} placeholder={p.field.placeholder} disabled={p.readOnly} onChange={(e) => p.onChange(e.currentTarget.value)} />
    </FieldShell>
  );
}

function NumberInput(p: BaseProps) {
  const id = fieldId(p);
  return (
    <FieldShell id={id} label={p.field.label}>
      <Input
        id={id}
        name={p.name}
        type="number"
        inputMode="decimal"
        value={typeof p.value === "number" ? String(p.value) : ""}
        min={p.field.min}
        max={p.field.max}
        step={p.field.step}
        disabled={p.readOnly}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          p.onChange(raw === "" ? undefined : Number(raw));
        }}
      />
    </FieldShell>
  );
}

/** Options carry any value (a number, a boolean); the controls key them by index. */
const indexOf = (options: readonly { value: unknown }[], value: unknown) => {
  const i = options.findIndex((o) => o.value === value || (value === undefined && (o.value === "" || o.value === false)));
  return i < 0 ? "" : String(i);
};

function SelectInput(p: BaseProps) {
  const id = fieldId(p);
  const options = p.field.options ?? [];
  return (
    <FieldShell id={id} label={p.field.label}>
      <Select value={indexOf(options, p.value)} disabled={p.readOnly} onValueChange={(i) => p.onChange(options[Number(i)]?.value)}>
        <SelectTrigger id={id} aria-label={p.field.label}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o, i) => (
            <SelectItem key={i} value={String(i)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

function RadioInput(p: BaseProps) {
  const id = fieldId(p);
  const options = p.field.options ?? [];
  // An unset yes/no shows its schema default (fields.ts puts it in metadata).
  const fallback = (p.field.metadata as { default?: unknown } | undefined)?.default;
  const value = p.value === undefined && fallback !== undefined ? fallback : p.value;
  return (
    <div className="flex flex-col gap-1.5 py-1" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-sm font-medium leading-none">
        {p.field.label}
      </span>
      <RadioGroup value={indexOf(options, value)} disabled={p.readOnly} onValueChange={(i) => p.onChange(options[Number(i)]?.value)} className="flex flex-wrap gap-4" aria-labelledby={`${id}-label`}>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <RadioGroupItem id={`${id}-${i}`} value={String(i)} />
            <Label htmlFor={`${id}-${i}`} className="font-normal">
              {o.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

/**
 * The Add picker's item: the preset's name, its section, and its limit. A
 * section at its limit can't be dragged in; it says why.
 */
function ComponentItem({ name, info, announce }: { name: string; info: ReadonlyMap<string, ComponentInfo>; announce?: ((message: string) => void) | undefined }) {
  const data = usePuck((s) => s.appState.data) as unknown as EditorData;
  const meta = info.get(name);
  const type = sectionTypeOf(name);
  const used = React.useMemo(() => countTypes(data).get(type) ?? 0, [data, type]);
  const full = meta?.limit !== undefined && used >= meta.limit;
  const dispatch = usePuck((s) => s.dispatch);
  const label = meta?.label ?? name;
  /** Dragging isn't the only way in (WCAG 2.5.7): the button adds the section at the end of its zone and selects it. */
  const add = () => {
    const zone = meta?.placement === "header" ? "root:header" : meta?.placement === "footer" ? "root:footer" : "root:default-zone";
    const list = zone === "root:header" ? data.root.props.header : zone === "root:footer" ? data.root.props.footer : data.content;
    const index = list?.length ?? 0;
    const id = newSectionId(type.replace(/-/g, "").slice(0, 6));
    dispatch({ type: "insert", componentType: name, destinationIndex: index, destinationZone: zone, id });
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone } } });
    scrollCanvasTo(id, ref.current?.ownerDocument);
    announce?.(`${label} added at the end of the ${zone === "root:header" ? "header" : zone === "root:footer" ? "footer" : "page"}. Its fields are open; Up and Down move it.`);
  };
  // Puck draws each item twice (a static copy under the draggable one): hide the copy from assistive tech.
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const copy = ref.current?.closest<HTMLElement>('[class*="draggableBg"]');
    if (copy) {
      copy.setAttribute("aria-hidden", "true");
      copy.inert = true;
    }
  }, []);
  // Puck's wrapper is the drag handle; a section at its limit has `insert` off (config.tsx), so it can't be dragged.
  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm text-foreground",
        full ? "cursor-not-allowed opacity-60" : "cursor-grab hover:border-primary",
      )}
      title={full ? `A page has at most ${meta?.limit} of these` : `Drag onto the page, or press Add: ${label}`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{label}</span>
        {meta && meta.label !== meta.sectionLabel ? <span className="text-xs text-muted-foreground">{meta.sectionLabel}</span> : null}
      </span>
      {full ? (
        <Badge variant="secondary" className="shrink-0">
          Limit reached
        </Badge>
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2" aria-label={`Add ${label}`} onPointerDown={(e) => e.stopPropagation()} onClick={add}>
          Add
        </Button>
      )}
    </div>
  );
}

/**
 * Above the selected section's fields: its name and Move up, Move down and
 * Remove buttons, so a section can be placed and removed with the keyboard
 * (Puck's canvas and outline move sections only by dragging).
 */
function SectionActions({ info, announce }: { info: ReadonlyMap<string, ComponentInfo>; announce?: ((message: string) => void) | undefined }) {
  const selected = usePuck((s) => s.selectedItem);
  const getSelectorForId = usePuck((s) => s.getSelectorForId);
  const getItemBySelector = usePuck((s) => s.getItemBySelector);
  const dispatch = usePuck((s) => s.dispatch);
  const upRef = React.useRef<HTMLButtonElement>(null);
  const downRef = React.useRef<HTMLButtonElement>(null);
  if (!selected) return null;
  const id = String(selected.props.id);
  const selector = getSelectorForId(id);
  if (!selector) return null;
  const label = info.get(selected.type)?.sectionLabel ?? selected.type;
  const { index, zone } = selector;
  const canUp = index > 0;
  const canDown = Boolean(getItemBySelector({ index: index + 1, zone }));
  const move = (by: -1 | 1) => {
    const to = index + by;
    dispatch({ type: "reorder", sourceIndex: index, destinationIndex: to, destinationZone: zone });
    dispatch({ type: "setUi", ui: { itemSelector: { index: to, zone } } });
    scrollCanvasTo(id);
    announce?.(`${label} moved ${by < 0 ? "up" : "down"}, to position ${to + 1}.`);
    // At the top or bottom the pressed button turns off: keep focus on the other one.
    requestAnimationFrame(() => {
      const pressed = by < 0 ? upRef.current : downRef.current;
      if (pressed?.disabled) (by < 0 ? downRef.current : upRef.current)?.focus();
    });
  };
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border px-1 pb-2" role="group" aria-label={`${label} section`}>
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex gap-1">
        <Button ref={upRef} type="button" size="sm" variant="outline" disabled={!canUp} onClick={() => move(-1)} aria-label={`Move ${label} up`}>
          Up
        </Button>
        <Button ref={downRef} type="button" size="sm" variant="outline" disabled={!canDown} onClick={() => move(1)} aria-label={`Move ${label} down`}>
          Down
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Remove ${label}`}
          onClick={() => {
            dispatch({ type: "remove", index, zone });
            dispatch({ type: "setUi", ui: { itemSelector: null } });
            announce?.(`${label} removed. Undo brings it back.`);
          }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

export interface GenesisOverrideOptions {
  /** Say what an action did (a section added, moved or removed), for a live region. */
  announce?: (message: string) => void;
}

export function genesisOverrides(info: ReadonlyMap<string, ComponentInfo>, extra: Partial<Overrides> = {}, options: GenesisOverrideOptions = {}): Partial<Overrides> {
  return {
    fields: ({ children }) => (
      <>
        <SectionActions info={info} announce={options.announce} />
        {children}
      </>
    ),
    fieldTypes: {
      text: TextInput as never,
      textarea: TextareaInput as never,
      number: NumberInput as never,
      select: SelectInput as never,
      radio: RadioInput as never,
    },
    fieldLabel: ({ children, label, el, className }) => {
      const El = el === "div" ? "div" : "label";
      return (
        <El className={cn("flex flex-col gap-1.5 py-1 text-sm font-medium", className)}>
          <span>{label}</span>
          {children}
        </El>
      );
    },
    drawerItem: ({ name }) => <ComponentItem name={name} info={info} announce={options.announce} />,
    ...extra,
  };
}
