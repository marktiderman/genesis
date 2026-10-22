import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import {
  choiceOptions,
  getFieldType,
  listFieldTypes,
  WORKSHEET_FIELD_TYPES,
  type Block,
  type FieldBlock,
  type FormDefinition,
  type Json,
} from "@marktiderman/genesis-forms";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Button } from "@marktiderman/genesis-ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@marktiderman/genesis-ui/dropdown-menu";
import { Input } from "@marktiderman/genesis-ui/input";
import { cn } from "@marktiderman/genesis-ui/utils";
import { DraftRow, NumberRow, SelectRow, SwitchRow, TextRow } from "./controls";
import type { Finding } from "./analyze";
import {
  createContent,
  createField,
  createPageBreak,
  blockIdPrefix,
  defaultProps,
  duplicateBlock,
  insertBlock,
  freshId,
  moveBlock,
  removeBlock,
  setOptions,
  updateBlock,
  withOptionValues,
} from "./ops";

import { contentTypes, editorFor, useBuilderConfig, type Apply, type BuilderConfig, type FieldPanelProps } from "./editors";

const TEXT_TYPES = new Set(["short-text", "long-text", "email", "phone"]);

const CATEGORY_LABEL: Record<string, string> = {
  text: "Text",
  choice: "Choice",
  scale: "Scale",
  date: "Date",
  media: "Media",
  advanced: "Advanced",
};

export function typeLabel(type: string, config: BuilderConfig = {}): string {
  return editorFor(config, type)?.label ?? getFieldType(type)?.label ?? type;
}

export interface PaletteEntry {
  type: string;
  label: string;
  category: string;
  icon?: ReactNode;
}

/**
 * The palette when the host names none: every registered type except the
 * worksheet types, which a host opts into by naming them, e.g.
 * `palette={[...defaultPalette(), ...WORKSHEET_FIELD_TYPES]}`.
 */
export function defaultPalette(): string[] {
  const optIn = new Set<string>(WORKSHEET_FIELD_TYPES);
  return listFieldTypes()
    .map((t) => t.type)
    .filter((type) => !optIn.has(type));
}

/**
 * The field types authors may add: `palette` in its order, else the default
 * palette. A type needs a registered manifest or an editor.
 */
export function paletteTypes(config: BuilderConfig = {}): PaletteEntry[] {
  const types = config.palette ?? defaultPalette();
  const out: PaletteEntry[] = [];
  for (const type of new Set(types)) {
    const manifest = getFieldType(type);
    const editor = editorFor(config, type);
    if (!manifest && !editor) continue;
    const entry: PaletteEntry = {
      type,
      label: editor?.label ?? manifest?.label ?? type,
      category: editor?.category ?? manifest?.category ?? "advanced",
    };
    if (editor?.icon !== undefined) entry.icon = editor.icon;
    out.push(entry);
  }
  return out;
}

function blockTitle(block: Block): string {
  if (block.kind === "field") return block.label || block.key;
  if (block.kind === "content") return block.text || (block.type === "heading" ? "Heading" : "Text");
  return block.title ? `Page break: ${block.title}` : "Page break";
}

/** The "Add" menu: every registered field type, grouped, then content blocks. */
export function AddBlockMenu({
  onAdd,
  label = "Add question",
  testID = "builder-add-block",
  variant = "default",
}: {
  onAdd: (make: (def: FormDefinition) => Block) => void;
  label?: string;
  testID?: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const config = useBuilderConfig();
  const byCategory = new Map<string, PaletteEntry[]>();
  for (const t of paletteTypes(config)) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  const content = contentTypes(config.blockKinds);
  const pageBreak = config.blockKinds?.pageBreak ?? true;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" data-testid={testID}>
          <Plus /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
        {[...byCategory].map(([category, types]) => (
          <div key={category}>
            <DropdownMenuLabel>{CATEGORY_LABEL[category] ?? category}</DropdownMenuLabel>
            {types.map((t) => (
              <DropdownMenuItem key={t.type} onSelect={() => onAdd((def) => createField(def, { type: t.type }, config.fieldEditors))}>
                {t.icon ?? null}
                {t.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        {content.length || pageBreak ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Layout</DropdownMenuLabel>
            {content.includes("heading") ? (
              <DropdownMenuItem onSelect={() => onAdd((def) => createContent("heading", undefined, def))}>Heading</DropdownMenuItem>
            ) : null}
            {content.includes("text") ? <DropdownMenuItem onSelect={() => onAdd((def) => createContent("text", undefined, def))}>Text</DropdownMenuItem> : null}
            {pageBreak ? <DropdownMenuItem onSelect={() => onAdd((def) => createPageBreak(undefined, def))}>Page break</DropdownMenuItem> : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function QuestionsPanel({
  def,
  apply,
  selected,
  onSelect,
  findings,
  ruleCount,
}: {
  def: FormDefinition;
  apply: Apply;
  selected: string | null;
  onSelect: (id: string | null) => void;
  findings: Finding[];
  ruleCount: (blockId: string) => number;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const config = useBuilderConfig();

  const add = (make: (def: FormDefinition) => Block) => {
    // Made here, not in the edit: edits run in the reducer and must stay pure.
    const created = make(def);
    const at = selected ? def.blocks.findIndex((b) => b.id === selected) + 1 : def.blocks.length;
    apply((d) => insertBlock(d, created, at || d.blocks.length));
    onSelect(created.id);
  };

  if (!def.blocks.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center" data-testid="builder-empty">
        <p className="mb-3 text-sm text-muted-foreground">No questions yet.</p>
        <AddBlockMenu onAdd={add} label="Add the first question" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ol className="space-y-2" aria-label="Questions">
        {def.blocks.map((block, index) => {
          const open = selected === block.id;
          const blockFindings = findings.filter((f) => f.ref?.kind === "block" && f.ref.id === block.id);
          const rules = ruleCount(block.id);
          const name = blockTitle(block);
          return (
            <li
              key={block.id}
              data-testid={`builder-block-${block.id}`}
              className={cn(
                "rounded-lg border bg-card transition-shadow",
                open ? "ring-2 ring-ring" : "hover:shadow-sm",
                dragging === block.id && "opacity-50",
              )}
              onDragOver={(e) => {
                if (dragging && dragging !== block.id) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && dragging !== block.id) apply((d) => moveBlock(d, dragging, index));
                setDragging(null);
              }}
            >
              <div className="flex items-center gap-2 p-3">
                {/* Only the handle drags, so selecting text in the row (or in its inspector) still works. */}
                <span
                  aria-hidden
                  draggable
                  title="Drag to reorder"
                  className="shrink-0 cursor-grab text-muted-foreground"
                  data-testid={`builder-block-grip-${block.id}`}
                  onDragStart={(e) => {
                    setDragging(block.id);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox starts a drag only when it carries data.
                    e.dataTransfer.setData("text/plain", block.id);
                    const row = e.currentTarget.closest("li");
                    if (row) e.dataTransfer.setDragImage?.(row, 16, 16);
                  }}
                  onDragEnd={() => setDragging(null)}
                >
                  <GripVertical className="size-4" />
                </span>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={open}
                  onClick={() => onSelect(open ? null : block.id)}
                  data-testid={`builder-block-toggle-${block.id}`}
                >
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                  <Badge variant="muted" className="shrink-0">
                    {block.kind === "field" ? typeLabel(block.type, config) : block.kind === "content" ? block.type : "page"}
                  </Badge>
                  {block.kind === "field" && block.required ? <Badge variant="outline">Required</Badge> : null}
                  {rules ? <Badge variant="info">{rules} rule{rules === 1 ? "" : "s"}</Badge> : null}
                  {blockFindings.length ? <Badge variant="warning">{blockFindings.length}</Badge> : null}
                </button>
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move "${name}" up`}
                    disabled={index === 0}
                    onClick={() => apply((d) => moveBlock(d, block.id, index - 1))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move "${name}" down`}
                    disabled={index === def.blocks.length - 1}
                    onClick={() => apply((d) => moveBlock(d, block.id, index + 1))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Duplicate "${name}"`} onClick={() => {
                      // The id is made here, not in the edit: edits must stay pure.
                      const copyId = freshId(blockIdPrefix(block), def);
                      apply((d) => duplicateBlock(d, block.id, copyId));
                    }}
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete "${name}"`}
                    data-testid={`builder-block-delete-${block.id}`}
                    onClick={() => {
                      apply((d) => removeBlock(d, block.id));
                      if (open) onSelect(null);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {open ? (
                <div className="space-y-4 border-t p-4">
                  {blockFindings.map((f, i) => (
                    <p key={i} className="rounded-md bg-warning/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      {f.message}
                    </p>
                  ))}
                  <BlockInspector def={def} block={block} apply={apply} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <AddBlockMenu onAdd={add} variant="outline" />
    </div>
  );
}

export function BlockInspector({ def, block, apply }: { def: FormDefinition; block: Block; apply: Apply }) {
  // A function patch reads the block as it is when the edit runs, not as rendered.
  const set: FieldPanelProps["set"] = (patch, coalesce) =>
    apply((d) => {
      if (typeof patch !== "function") return updateBlock(d, block.id, patch);
      const latest = d.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === block.id);
      return latest ? updateBlock(d, block.id, patch(latest)) : d;
    }, coalesce);
  const setProps: FieldPanelProps["setProps"] = (props, coalesce) =>
    set((latest) => {
      const next: Record<string, Json> = { ...latest.props };
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      return { props: Object.keys(next).length ? next : undefined };
    }, coalesce);

  const config = useBuilderConfig();
  if (block.kind === "content") {
    const allowed = new Set<string>([...contentTypes(config.blockKinds), block.type]);
    return (
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <SelectRow
          label="Style"
          value={block.type}
          options={[
            { value: "heading", label: "Heading" },
            { value: "text", label: "Text" },
          ].filter((o) => allowed.has(o.value))}
          onChange={(type) => set({ type: type as "heading" | "text" })}
        />
        <TextRow label="Text" multiline value={block.text} onChange={(text) => set({ text }, `text:${block.id}`)} />
      </div>
    );
  }
  if (block.kind === "page-break") {
    return (
      <TextRow
        label="Page title"
        value={block.title ?? ""}
        hint="Shown at the top of the page in classic layout."
        onChange={(title) => set({ title }, `title:${block.id}`)}
      />
    );
  }
  return <FieldInspector def={def} field={block} set={set} setProps={setProps} apply={apply} />;
}

function FieldInspector({
  def,
  field,
  set,
  setProps,
  apply,
}: {
  def: FormDefinition;
  field: FieldBlock;
  set: FieldPanelProps["set"];
  setProps: FieldPanelProps["setProps"];
  apply: Apply;
}) {
  const config = useBuilderConfig();
  const types = paletteTypes(config).map((t) => ({ value: t.type, label: t.label }));
  // The current type stays selectable, also when the palette leaves it out.
  if (!types.some((t) => t.value === field.type)) types.unshift({ value: field.type, label: typeLabel(field.type, config) });
  const isChoice = field.type === "single-choice" || field.type === "multi-choice";
  const editor = editorFor(config, field.type);
  const Panel = editor?.Panel;
  const setType = (type: string) => {
    if (type === field.type) return;
    // Between single and multiple choice the options stay; otherwise the new
    // type's default props are made here (new option values are random), so the edit stays pure.
    const keepsOptions = isChoice && (type === "single-choice" || type === "multi-choice") && !editorFor(config, type)?.defaultProps;
    if (keepsOptions) set({ type });
    else set({ type, props: defaultProps(type, { def, editors: config.fieldEditors }) });
  };
  const anonymous = !!def.settings?.anonymous;
  return (
    <div className="space-y-4">
      <TextRow
        label="Question"
        value={field.label}
        testID="builder-field-label"
        hint="Use {{field:key}} or {{hidden:name}} to repeat an earlier answer, with a fallback after |."
        onChange={(label) => set({ label }, `label:${field.id}`)}
      />
      <TextRow
        label="Description"
        multiline
        value={field.description ?? ""}
        onChange={(description) => set({ description }, `description:${field.id}`)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectRow
          label="Type"
          value={field.type}
          options={types}
          hint="Changing the type resets its settings and removes rules that compare this question. Between single and multiple choice, the options and the rules that still fit stay."
          onChange={setType}
        />
        <DraftRow
          label="Key"
          value={field.key}
          testID="builder-field-key"
          hint="The column name in exports and the name used in {{field:…}}. Renaming updates its uses."
          onCommit={(key) => set({ key })}
        />
      </div>
      {Panel ? <Panel def={def} field={field} set={set} setProps={setProps} apply={apply} /> : null}
      {!Panel && TEXT_TYPES.has(field.type) ? (
        <TextRow
          label="Placeholder"
          value={field.placeholder ?? ""}
          onChange={(placeholder) => set({ placeholder }, `placeholder:${field.id}`)}
        />
      ) : null}
      {!Panel && field.type === "rating" ? (
        <NumberRow
          label="Highest rating"
          commitOnBlur
          min={2}
          max={10}
          value={typeof field.props?.max === "number" ? field.props.max : 5}
          onChange={(max) => set({ props: { ...field.props, max: Math.min(10, Math.max(2, max ?? 5)) } })}
        />
      ) : null}
      {!Panel && (field.type === "short-text" || field.type === "long-text") ? (
        <NumberRow
          label="Longest answer (characters)"
          min={1}
          value={typeof field.props?.maxLength === "number" ? field.props.maxLength : undefined}
          hint="Leave empty for the default limit."
          onChange={(maxLength) => {
            const props = { ...field.props };
            if (maxLength && maxLength > 0) props.maxLength = maxLength;
            else delete props.maxLength;
            set({ props: Object.keys(props).length ? props : undefined }, `maxLength:${field.id}`);
          }}
        />
      ) : null}
      {!Panel && isChoice ? <OptionsEditor field={field} apply={apply} /> : null}
      <div className="space-y-3 rounded-md border p-3">
        <SwitchRow
          label="Required"
          checked={!!field.required}
          testID="builder-field-required"
          onChange={(required) => set({ required })}
        />
        <SwitchRow
          label="Identifies the respondent"
          hint={
            anonymous
              ? "This form is anonymous, so this question is not asked."
              : "Name, email, phone. Not asked when the form is anonymous."
          }
          checked={!!field.identifying}
          onChange={(identifying) => set({ identifying })}
        />
        <SwitchRow
          label="Sensitive"
          hint="Masked in developer tools and left out of share links."
          checked={!!field.sensitive}
          onChange={(sensitive) => set({ sensitive })}
        />
      </div>
    </div>
  );
}

function OptionsEditor({ field, apply }: { field: FieldBlock; apply: Apply }) {
  const options = choiceOptions(field).map((o) => ({ value: o.value, label: o.label ?? o.value }));
  const save = (next: { value?: string; label: string }[], coalesce?: string) => {
    // Values are made here, not in the edit: edits must stay pure.
    const filled = withOptionValues(next);
    apply((d) => setOptions(d, field.id, filled), coalesce);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Options</legend>
      <ol className="space-y-2">
        {options.map((o, i) => (
          <li key={o.value} className="flex items-center gap-2">
            <Input
              aria-label={`Option ${i + 1}`}
              value={o.label}
              data-testid={`builder-option-${i}`}
              onChange={(e) =>
                save(
                  options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  `option:${field.id}:${o.value}`,
                )
              }
            />
            <code className="hidden shrink-0 text-xs text-muted-foreground sm:block" title="Stored value">
              {o.value}
            </code>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Move option up"
              disabled={i === 0}
              onClick={() => {
                const next = [...options];
                [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                save(next);
              }}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove option"
              disabled={options.length <= 1}
              onClick={() => save(options.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </li>
        ))}
      </ol>
      <Button
        variant="outline"
        size="sm"
        data-testid="builder-option-add"
        onClick={() => save([...options, { label: `Option ${options.length + 1}` }])}
      >
        <Plus /> Add option
      </Button>
      <p className="text-xs text-muted-foreground">
        Answers store the value on the right, so a relabelled option keeps its earlier answers (they show the new label).
        Removing an option takes it out of “is one of” lists and removes the other rules that compare with it.
      </p>
    </fieldset>
  );
}
