import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Copy, Flag, Plus, Star, Trash2, X } from "lucide-react";
import {
  choiceOptions,
  getFieldType,
  COMPUTED_FIELD_TYPES,
  listFieldTypes,
  STRUCTURED_FIELD_TYPES,
  type Block,
  type FieldBlock,
  type FormDefinition,
  type Json,
} from "@marktiderman/genesis-forms";
import { Badge } from "@marktiderman/genesis-ui/badge";
import { Checkbox } from "@marktiderman/genesis-ui/checkbox";
import { Label } from "@marktiderman/genesis-ui/label";
import { Button } from "@marktiderman/genesis-ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@marktiderman/genesis-ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@marktiderman/genesis-ui/dropdown-menu";
import { Input } from "@marktiderman/genesis-ui/input";
import { SortableList } from "@marktiderman/genesis-ui/patterns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { cn } from "@marktiderman/genesis-ui/utils";
import { useChecks } from "./checks";
import { DraftRow, Editable, NumberRow, SectionLabel, Segmented, SwitchRow, TextRow } from "./controls";
import { BlockIcon } from "./type-icons";
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

import {
  contentTypes,
  editorFor,
  useBuilderConfig,
  type Apply,
  type BuilderConfig,
  type FieldPanelProps,
  type FieldPreset,
} from "./editors";
import { chosenOutputs, clearOutputs, outputPropsFor, outputsFor, outputUsedBy, setOutput, type OutputTarget } from "./outputs";

const TEXT_TYPES = new Set(["short-text", "long-text", "email", "phone", "number"]);
const CHOICE_TYPES = new Set(["single-choice", "multi-choice", "dropdown"]);

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
 * opt-in ones, the structured types (`STRUCTURED_FIELD_TYPES`) and the
 * calculated type (`COMPUTED_FIELD_TYPES`), which a host offers by naming
 * them, e.g. `palette={[...defaultPalette(), ...STRUCTURED_FIELD_TYPES, ...COMPUTED_FIELD_TYPES]}`.
 */
export function defaultPalette(): string[] {
  const optIn = new Set<string>([...STRUCTURED_FIELD_TYPES, ...COMPUTED_FIELD_TYPES]);
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

/** One of the host's presets as the Add menu lists it: a named variant of `type`. */
export interface PresetEntry extends PaletteEntry {
  preset: FieldPreset;
}

/**
 * The host's presets the Add menu offers, in their order. A preset whose base
 * type has no registered manifest and no editor is left out. It is listed in
 * its own `category`, else in its base type's. Its base type need not be in
 * the palette: a host may offer a table only as its own named variants.
 */
export function palettePresets(config: BuilderConfig = {}): PresetEntry[] {
  const out: PresetEntry[] = [];
  const seen = new Set<string>();
  for (const preset of config.presets ?? []) {
    if (seen.has(preset.id)) continue;
    const manifest = getFieldType(preset.type);
    const editor = editorFor(config, preset.type);
    if (!manifest && !editor) continue;
    seen.add(preset.id);
    const entry: PresetEntry = {
      type: preset.type,
      label: preset.label,
      category: preset.category ?? editor?.category ?? manifest?.category ?? "advanced",
      preset,
    };
    const icon = preset.icon ?? editor?.icon;
    if (icon !== undefined) entry.icon = icon;
    out.push(entry);
  }
  return out;
}

/**
 * A new field from a preset: its base type's default props with the preset's
 * `props` laid over them (top-level keys replace), then the preset's `field`
 * settings. The label is `field.label`, else the preset's label.
 */
export function createPresetField(def: FormDefinition, preset: FieldPreset, config: BuilderConfig = {}): FieldBlock {
  const base = defaultProps(preset.type, { def, ...(config.fieldEditors ? { editors: config.fieldEditors } : {}) });
  // Copied, so fields made from one preset never share arrays or objects.
  const own = preset.props ? (JSON.parse(JSON.stringify(preset.props)) as Record<string, Json>) : undefined;
  const props = base || own ? { ...base, ...own } : undefined;
  const block = createField(
    def,
    { type: preset.type, label: preset.field?.label ?? preset.label, ...(props ? { props } : {}) },
    config.fieldEditors,
  );
  if (preset.field?.required) block.required = true;
  if (preset.field?.description) block.description = preset.field.description;
  if (preset.field?.placeholder) block.placeholder = preset.field.placeholder;
  return block;
}

function blockTitle(block: Block): string {
  if (block.kind === "field") return block.label || "Untitled question";
  if (block.kind === "content") return block.text || (block.type === "heading" ? "Heading" : "Text");
  return block.title ? `Page break: ${block.title}` : "Page break";
}

/** The "Add" menu: every registered field type, grouped, then content blocks. */
export function AddBlockMenu({
  onAdd,
  label = "Add question",
  testID = "builder-add-block",
  variant = "default",
  className,
}: {
  onAdd: (make: (def: FormDefinition) => Block) => void;
  label?: string;
  testID?: string;
  variant?: "default" | "outline" | "ghost";
  className?: string;
}) {
  const config = useBuilderConfig();
  const byCategory = new Map<string, PaletteEntry[]>();
  // Presets follow the base types, so in a shared category they come after them.
  for (const t of [...paletteTypes(config), ...palettePresets(config)]) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  const content = contentTypes(config.blockKinds);
  const pageBreak = config.blockKinds?.pageBreak ?? true;
  // After adding, focus goes to the new question's title, not back to this button.
  const added = useRef(false);
  const addAndKeepFocus = (make: (def: FormDefinition) => Block) => {
    added.current = true;
    onAdd(make);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" data-testid={testID} className={className}>
          <Plus /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-96 overflow-y-auto"
        onCloseAutoFocus={(e) => {
          if (!added.current) return;
          added.current = false;
          e.preventDefault();
        }}
      >
        {[...byCategory].map(([category, types]) => (
          <div key={category}>
            <DropdownMenuLabel>{CATEGORY_LABEL[category] ?? category}</DropdownMenuLabel>
            {types.map((t) => {
              const preset = "preset" in t ? (t as PresetEntry).preset : undefined;
              return (
                <DropdownMenuItem
                  key={preset ? `preset:${preset.id}` : t.type}
                  title={preset?.description}
                  data-testid={preset ? `builder-add-preset-${preset.id}` : undefined}
                  onSelect={() =>
                    // A new question starts untitled: the author writes its title first.
                    addAndKeepFocus((def) =>
                      preset ? createPresetField(def, preset, config) : createField(def, { type: t.type, label: "" }, config.fieldEditors),
                    )
                  }
                >
                  {t.icon ?? null}
                  {t.label}
                </DropdownMenuItem>
              );
            })}
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

/** "Question 2", "Heading", "Page break": what the editor card's header calls a block. */
function blockHeading(block: Block, number: number | undefined): string {
  if (block.kind === "field") return `Question ${number ?? ""}`.trim();
  if (block.kind === "content") return block.type === "heading" ? "Heading" : "Text";
  return "Page break";
}

/** Each field's number among the questions (headings, text and page breaks are not numbered). */
export function questionNumbers(def: FormDefinition): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of def.blocks) if (b.kind === "field") out.set(b.id, out.size + 1);
  return out;
}

/**
 * The Questions panel: an outline of every block on the left (select,
 * drag or keyboard-reorder, add), the selected block's editor in the middle
 * and, when `preview` is given, the live preview on the right. In a narrow
 * container the columns stack: outline, editor, preview.
 *
 * The editor shows `selected`, else the first block.
 */
export function QuestionsPanel({
  def,
  apply,
  selected,
  onSelect,
  findings,
  ruleCount,
  preview,
  onOpenEnding,
}: {
  def: FormDefinition;
  apply: Apply;
  selected: string | null;
  onSelect: (id: string | null) => void;
  findings: Finding[];
  ruleCount: (blockId: string) => number;
  /** The third column: the builder passes its live preview (and checks). */
  preview?: ReactNode;
  /** Open an ending listed under the outline, for example in the Logic and endings panel. */
  onOpenEnding?: ((id: string) => void) | undefined;
}) {
  // The question whose title field takes focus when its editor opens: the one just added.
  const [focusTitle, setFocusTitle] = useState<string | null>(null);
  // The editor is remade for another block after Duplicate or Delete: where focus goes in the new one.
  const [refocus, setRefocus] = useState<{ id: string; target: "duplicate" | "card" } | null>(null);
  const config = useBuilderConfig();
  const checks = useChecks();
  const readOnly = !!config.readOnly;
  const numbers = questionNumbers(def);
  const current = def.blocks.find((b) => b.id === selected) ?? def.blocks[0] ?? null;
  // The block shown is the one selected, so moving it (or another block to the top) keeps it in the editor.
  const shownId = current?.id ?? null;
  useEffect(() => {
    if (shownId !== selected && shownId !== null) onSelect(shownId);
  }, [shownId, selected, onSelect]);

  const add = (make: (def: FormDefinition) => Block) => {
    // Made here, not in the edit: edits run in the reducer and must stay pure.
    const created = make(def);
    // Added at the end, under the rows the button sits below.
    apply((d) => insertBlock(d, created, d.blocks.length));
    if (created.kind === "field") {
      if (!created.label.trim()) checks?.markFresh(created.id);
      setFocusTitle(created.id);
    }
    onSelect(created.id);
  };

  const grid = cn(
    "grid items-start gap-6",
    preview
      ? "@min-[34rem]:grid-cols-[13rem_minmax(0,1fr)] @min-[56rem]:grid-cols-[13rem_minmax(0,1fr)_20rem] @min-[76rem]:grid-cols-[16rem_minmax(0,1fr)_24.5rem]"
      : "@min-[34rem]:grid-cols-[13rem_minmax(0,1fr)] @min-[48rem]:grid-cols-[16rem_minmax(0,1fr)]",
  );

  if (!def.blocks.length) {
    return (
      <div className="@container" data-testid="builder-questions">
        <div className={grid}>
          <div className="rounded-lg border border-dashed p-8 text-center @min-[34rem]:col-span-2" data-testid="builder-empty">
            <p className={cn("text-sm text-muted-foreground", !readOnly && "mb-3")}>No questions yet.</p>
            {readOnly ? null : <AddBlockMenu onAdd={add} label="Add the first question" />}
          </div>
          {preview ? <div className="@min-[34rem]:col-span-2 @min-[56rem]:col-span-1">{preview}</div> : null}
        </div>
      </div>
    );
  }

  const endings = def.endings ?? [];
  return (
    <div className="@container" data-testid="builder-questions">
      <div className={grid}>
        <nav aria-label="Outline" className="min-w-0 space-y-3 @min-[34rem]:sticky @min-[34rem]:top-4" data-testid="builder-outline">
          <SectionLabel>Questions</SectionLabel>
          <SortableList
            items={def.blocks}
            getKey={(b) => b.id}
            getItemLabel={blockTitle}
            label="Questions"
            disabled={readOnly}
            // The editor's header has Move up and Move down, so rows need no menu of their own.
            moveMenu={false}
            className="gap-2"
            onReorder={(_from, to, { key }) => apply((d) => moveBlock(d, key, to))}
            renderItem={(block, { handle, isGrabbed }) => (
              <OutlineRow
                block={block}
                number={numbers.get(block.id)}
                active={current?.id === block.id}
                grabbed={isGrabbed}
                handle={handle}
                rules={ruleCount(block.id)}
                issues={findings.filter((f) => f.ref?.kind === "block" && f.ref.id === block.id).length}
                onSelect={() => {
                  setFocusTitle(null);
                  onSelect(block.id);
                }}
              />
            )}
          />
          {readOnly ? null : (
            <AddBlockMenu
              onAdd={add}
              variant="outline"
              className="h-10 w-full border-dashed bg-transparent text-sm font-medium shadow-none"
            />
          )}
          {endings.length ? (
            <div className="space-y-2 pt-3">
              <SectionLabel>{endings.length === 1 ? "Ending" : "Endings"}</SectionLabel>
              <ul className="space-y-2" aria-label="Endings">
                {endings.map((e) => {
                  const body = (
                    <>
                      <Flag className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 truncate">{e.title || "Untitled ending"}</span>
                    </>
                  );
                  const row = "flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left text-sm";
                  return (
                    <li key={e.id}>
                      {onOpenEnding ? (
                        <button
                          type="button"
                          className={cn(row, "hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                          onClick={() => onOpenEnding(e.id)}
                          data-testid={`builder-outline-ending-${e.id}`}
                          title="Edit in Logic and endings"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className={row}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </nav>

        {current ? (
          <BlockEditorCard
            key={current.id}
            def={def}
            block={current}
            number={numbers.get(current.id)}
            apply={apply}
            findings={findings.filter((f) => f.ref?.kind === "block" && f.ref.id === current.id)}
            autoFocusTitle={focusTitle === current.id}
            focusOnMount={refocus?.id === current.id ? refocus.target : undefined}
            onSelect={onSelect}
            onReplaced={(id, target) => setRefocus({ id, target })}
          />
        ) : null}

        {preview ? (
          <aside aria-label="Preview" className="min-w-0 @min-[34rem]:col-span-2 @min-[56rem]:sticky @min-[56rem]:top-4 @min-[56rem]:col-span-1">
            {preview}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function OutlineRow({
  block,
  number,
  active,
  grabbed,
  handle,
  rules,
  issues,
  onSelect,
}: {
  block: Block;
  number: number | undefined;
  active: boolean;
  grabbed: boolean;
  handle: ReactNode;
  rules: number;
  issues: number;
  onSelect: () => void;
}) {
  const config = useBuilderConfig();
  const name = blockTitle(block);
  const meta =
    block.kind === "field"
      ? [String(number), typeLabel(block.type, config), block.required ? "Required" : null, rules ? `${rules} rule${rules === 1 ? "" : "s"}` : null]
          .filter(Boolean)
          .join(" · ")
      : block.kind === "content"
        ? block.type === "heading"
          ? "Heading"
          : "Text"
        : "Page break";
  return (
    <div
      data-testid={`builder-block-${block.id}`}
      data-active={active || undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border bg-card py-2 pl-1.5 pr-2.5 transition-colors",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-foreground/20",
        grabbed && "shadow-md",
        !handle && "pl-3",
      )}
    >
      {handle ? (
        <span className="shrink-0" data-testid={`builder-block-grip-${block.id}`} title="Drag to reorder, or press Space to pick up">
          {handle}
        </span>
      ) : null}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-current={active ? "true" : undefined}
        onClick={onSelect}
        data-testid={`builder-block-toggle-${block.id}`}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md border bg-background",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          <BlockIcon block={block} config={config} className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={name} data-testid={`builder-block-title-${block.id}`}>
            {name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{meta}</span>
        </span>
      </button>
      {issues ? (
        <Badge variant="warning" className="shrink-0 px-1.5" title={`${issues} to check`}>
          {issues}
        </Badge>
      ) : null}
    </div>
  );
}

/** The selected block's editor: header with its type and actions, then its settings. */
function BlockEditorCard({
  def,
  block,
  number,
  apply,
  findings,
  autoFocusTitle,
  focusOnMount,
  onSelect,
  onReplaced,
}: {
  def: FormDefinition;
  block: Block;
  number: number | undefined;
  apply: Apply;
  findings: Finding[];
  autoFocusTitle: boolean;
  /** Focus this card's Duplicate button, or the card, when it mounts (it replaced the card that had focus). */
  focusOnMount?: "duplicate" | "card" | undefined;
  onSelect: (id: string | null) => void;
  /** This card is about to be replaced by block `id`'s, from one of its own buttons. */
  onReplaced: (id: string, target: "duplicate" | "card") => void;
}) {
  const root = useRef<HTMLElement>(null);
  // Read once, when this card mounts: later renders must not pull focus back.
  const initialFocus = useRef(focusOnMount);
  useEffect(() => {
    const el = root.current;
    if (!initialFocus.current || !el) return;
    const target = initialFocus.current === "duplicate" ? el.querySelector<HTMLElement>('[data-action="duplicate"]') : el;
    (target ?? el).focus();
  }, []);
  const config = useBuilderConfig();
  const readOnly = !!config.readOnly;
  const index = def.blocks.findIndex((b) => b.id === block.id);
  const name = blockTitle(block);
  const heading = blockHeading(block, number);
  const iconButton = "size-8 text-muted-foreground hover:text-foreground";
  return (
    <section
      aria-label={heading}
      ref={root}
      tabIndex={-1}
      className="min-w-0 rounded-xl border bg-card p-5 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring @lg:p-6"
      data-testid="builder-editor"
      data-block={block.id}
    >
      <Editable readOnly={readOnly} className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{heading}</h3>
          {block.kind === "field" ? <TypeChip def={def} field={block} apply={apply} /> : null}
          <span className="flex-1" />
          {readOnly ? null : (
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className={iconButton}
                aria-label={`Move "${name}" up`}
                disabled={index === 0}
                onClick={() => apply((d) => moveBlock(d, block.id, index - 1))}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={iconButton}
                aria-label={`Move "${name}" down`}
                disabled={index === def.blocks.length - 1}
                onClick={() => apply((d) => moveBlock(d, block.id, index + 1))}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={iconButton}
                aria-label={`Duplicate "${name}"`}
                title="Duplicate"
                data-action="duplicate"
                onClick={() => {
                  // The id is made here, not in the edit: edits must stay pure.
                  const copyId = freshId(blockIdPrefix(block), def);
                  apply((d) => duplicateBlock(d, block.id, copyId));
                  onReplaced(copyId, "duplicate");
                  onSelect(copyId);
                }}
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={iconButton}
                aria-label={`Delete "${name}"`}
                title="Delete"
                data-testid={`builder-block-delete-${block.id}`}
                onClick={() => {
                  // The next block takes the editor, else the one before.
                  const neighbour = def.blocks[index + 1] ?? def.blocks[index - 1];
                  apply((d) => removeBlock(d, block.id));
                  if (neighbour) onReplaced(neighbour.id, "card");
                  onSelect(neighbour?.id ?? null);
                }}
              >
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
        {findings.map((f, i) => (
          <p key={i} className="rounded-md bg-warning/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            {f.message}
          </p>
        ))}
        <BlockInspector
          def={def}
          block={block}
          apply={apply}
          autoFocusTitle={autoFocusTitle}
          titleInvalid={findings.some((f) => f.code === "untitled-question")}
        />
      </Editable>
    </section>
  );
}

/**
 * Change a field's type. Between single choice, multiple choice and dropdown
 * the options stay; otherwise the new type's default props are made here (new
 * option values are random), so the edit stays pure. Where the answer goes
 * stays, for the output targets the new type also accepts.
 */
function changeType(def: FormDefinition, field: FieldBlock, type: string, config: BuilderConfig, set: FieldPanelProps["set"]) {
  if (type === field.type) return;
  const keepsOptions = CHOICE_TYPES.has(field.type) && CHOICE_TYPES.has(type) && !editorFor(config, type)?.defaultProps;
  if (keepsOptions) return set({ type });
  const kept = outputPropsFor(field, type, config.outputs);
  const base = defaultProps(type, { def, editors: config.fieldEditors });
  const props = Object.keys(kept).length ? { ...base, ...kept } : base;
  set({ type, props });
}

/** The edit sink for one field, reading the field as it is when the edit runs. */
function fieldSetters(apply: Apply, id: string) {
  const set: FieldPanelProps["set"] = (patch, coalesce) =>
    apply((d) => {
      if (typeof patch !== "function") return updateBlock(d, id, patch);
      const latest = d.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === id);
      return latest ? updateBlock(d, id, patch(latest)) : d;
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
  return { set, setProps };
}

const TYPE_HINT =
  "Changing the type resets its settings and removes rules that compare this question. Between single choice, multiple choice and dropdown, the options and the rules that still fit stay.";

/** The type picker chip in the editor's header. */
function TypeChip({ def, field, apply }: { def: FormDefinition; field: FieldBlock; apply: Apply }) {
  const config = useBuilderConfig();
  const types = paletteTypes(config).map((t) => ({ value: t.type, label: t.label }));
  // The current type stays selectable, also when the palette leaves it out.
  if (!types.some((t) => t.value === field.type)) types.unshift({ value: field.type, label: typeLabel(field.type, config) });
  const { set } = fieldSetters(apply, field.id);
  const icon = (type: string) => <BlockIcon block={{ ...field, type }} config={config} className="size-3.5" />;
  return (
    <Select value={field.type} onValueChange={(type) => changeType(def, field, type, config, set)}>
      <SelectTrigger
        aria-label="Type"
        title={TYPE_HINT}
        data-testid="builder-field-type"
        className="h-7 w-auto gap-1.5 rounded-md border-transparent bg-muted px-2 text-[0.8125rem] font-medium focus:ring-offset-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-96">
        {types.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            <span className="inline-flex items-center gap-1.5">
              {icon(t.value)}
              {t.label}
            </span>
          </SelectItem>
        ))}
        <p className="max-w-64 border-t px-2 py-2 text-xs text-muted-foreground">{TYPE_HINT}</p>
      </SelectContent>
    </Select>
  );
}

export function BlockInspector({
  def,
  block,
  apply,
  autoFocusTitle,
  titleInvalid,
}: {
  def: FormDefinition;
  block: Block;
  apply: Apply;
  /** Focus the question's title field when it opens (a question just added). */
  autoFocusTitle?: boolean | undefined;
  /** The title is flagged by a check ("needs a title"). */
  titleInvalid?: boolean | undefined;
}) {
  // A function patch reads the block as it is when the edit runs, not as rendered.
  const { set, setProps } = fieldSetters(apply, block.id);
  const config = useBuilderConfig();
  if (block.kind === "content") {
    const allowed = new Set<string>([...contentTypes(config.blockKinds), block.type]);
    const styles = [
      { value: "heading", label: "Heading" },
      { value: "text", label: "Text" },
    ].filter((o) => allowed.has(o.value));
    return (
      <div className="space-y-4">
        {styles.length > 1 ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Style</p>
            <Segmented ariaLabel="Style" value={block.type} options={styles} onChange={(type) => set({ type: type as "heading" | "text" })} />
          </div>
        ) : null}
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
  return (
    <FieldInspector
      def={def}
      field={block}
      set={set}
      setProps={setProps}
      apply={apply}
      autoFocusTitle={!!autoFocusTitle}
      titleInvalid={!!titleInvalid}
    />
  );
}

const SCALES = ["3", "5", "10"] as const;

/** Rating: the scale (1–3, 1–5, 1–10 or another highest value), numbers or stars. */
function RatingScale({ field, set, setProps }: { field: FieldBlock; set: FieldPanelProps["set"]; setProps: FieldPanelProps["setProps"] }) {
  const max = typeof field.props?.max === "number" ? field.props.max : 5;
  const [custom, setCustom] = useState(() => !(SCALES as readonly string[]).includes(String(max)));
  const scale = custom || !(SCALES as readonly string[]).includes(String(max)) ? "other" : String(max);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Scale</p>
          <Segmented
            ariaLabel="Scale"
            testID="builder-rating-scale"
            value={scale}
            options={[...SCALES.map((n) => ({ value: n, label: `1–${n}` })), { value: "other", label: "Other" }]}
            onChange={(v) => {
              if (v === "other") return setCustom(true);
              setCustom(false);
              set({ props: { ...field.props, max: Number(v) } });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Show as</p>
          <Segmented
            ariaLabel="Show as"
            testID="builder-rating-display"
            value={field.props?.display === "stars" ? "stars" : "numbers"}
            options={[
              { value: "numbers", label: "Numbers" },
              { value: "stars", label: "Stars", icon: <Star aria-hidden /> },
            ]}
            onChange={(display) => setProps({ display: display === "stars" ? "stars" : undefined })}
          />
        </div>
      </div>
      {scale === "other" ? (
        <NumberRow
          label="Highest rating"
          commitOnBlur
          min={2}
          max={10}
          hint="From 2 to 10."
          testID="builder-rating-max"
          value={max}
          onChange={(n) => set({ props: { ...field.props, max: Math.min(10, Math.max(2, n ?? 5)) } })}
        />
      ) : null}
    </div>
  );
}

function FieldInspector({
  def,
  field,
  set,
  setProps,
  apply,
  autoFocusTitle,
  titleInvalid,
}: {
  def: FormDefinition;
  field: FieldBlock;
  set: FieldPanelProps["set"];
  setProps: FieldPanelProps["setProps"];
  apply: Apply;
  autoFocusTitle: boolean;
  titleInvalid: boolean;
}) {
  const config = useBuilderConfig();
  const checks = useChecks();
  const isChoice = CHOICE_TYPES.has(field.type);
  const editor = editorFor(config, field.type);
  const Panel = editor?.Panel;
  const calculated = field.type === "calculated";
  const anonymous = !!def.settings?.anonymous;
  const flagged = [field.identifying && "identifies the respondent", field.sensitive && "sensitive"].filter(Boolean) as string[];
  const max = typeof field.props?.max === "number" ? field.props.max : field.type === "nps" ? 10 : 5;

  const answer: ReactNode[] = [];
  if (Panel) answer.push(<Panel key="panel" def={def} field={field} set={set} setProps={setProps} apply={apply} readOnly={!!config.readOnly} />);
  else {
    if (TEXT_TYPES.has(field.type)) {
      answer.push(
        <TextRow
          key="placeholder"
          label="Placeholder"
          value={field.placeholder ?? ""}
          onChange={(placeholder) => set({ placeholder }, `placeholder:${field.id}`)}
        />,
      );
    }
    if (field.type === "rating") answer.push(<RatingScale key="scale" field={field} set={set} setProps={setProps} />);
    if (field.type === "rating" || field.type === "nps") {
      answer.push(
        <div key="labels" className="grid gap-4 @lg:grid-cols-2">
          <TextRow
            label={`Label under ${field.type === "nps" ? 0 : 1}`}
            value={typeof field.props?.lowLabel === "string" ? field.props.lowLabel : ""}
            placeholder={field.type === "nps" ? "Not likely" : "Poor"}
            testID="builder-scale-low"
            onChange={(v) => setProps({ lowLabel: v || undefined }, `lowLabel:${field.id}`)}
          />
          <TextRow
            label={`Label under ${max}`}
            value={typeof field.props?.highLabel === "string" ? field.props.highLabel : ""}
            placeholder={field.type === "nps" ? "Very likely" : "Great"}
            testID="builder-scale-high"
            onChange={(v) => setProps({ highLabel: v || undefined }, `highLabel:${field.id}`)}
          />
        </div>,
      );
    }
    if (field.type === "number") {
      answer.push(
        <div key="number" className="grid gap-4 @lg:grid-cols-3">
          {(["min", "max", "step"] as const).map((k) => (
            <NumberRow
              key={k}
              decimal
              label={k === "min" ? "Smallest" : k === "max" ? "Largest" : "Step"}
              testID={`builder-number-${k}`}
              value={typeof field.props?.[k] === "number" ? (field.props[k] as number) : undefined}
              hint={k === "step" ? "1 for whole numbers." : "Optional."}
              onChange={(n) => setProps({ [k]: n })}
            />
          ))}
        </div>,
      );
    }
    if (field.type === "date") {
      answer.push(
        <div key="date" className="grid gap-4 @lg:grid-cols-2">
          {(["min", "max"] as const).map((k) => (
            <TextRow
              key={k}
              type="date"
              label={k === "min" ? "Earliest date" : "Latest date"}
              testID={`builder-date-${k}`}
              value={typeof field.props?.[k] === "string" ? (field.props[k] as string) : ""}
              hint="Optional."
              onChange={(v) => setProps({ [k]: v || undefined })}
            />
          ))}
        </div>,
      );
    }
    if (field.type === "consent") {
      answer.push(
        <TextRow
          key="consent"
          label="Checkbox text"
          value={typeof field.props?.text === "string" ? field.props.text : ""}
          placeholder="I agree"
          testID="builder-consent-text"
          hint="Turn on Required so it must be checked to send."
          onChange={(text) => setProps({ text: text || undefined }, `consent-text:${field.id}`)}
        />,
      );
    }
    if (field.type === "short-text" || field.type === "long-text") {
      answer.push(
        <NumberRow
          key="maxLength"
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
        />,
      );
    }
    if (isChoice) answer.push(<OptionsEditor key="options" field={field} apply={apply} />);
  }

  return (
    <div className="@container space-y-5">
      <div className="space-y-3">
        <TextRow
          label="Question"
          hideLabel
          value={field.label}
          placeholder="Your question"
          testID="builder-field-label"
          inputClassName="h-12 text-lg font-semibold"
          autoFocus={autoFocusTitle}
          invalid={titleInvalid}
          onBlur={() => checks?.touch(field.id)}
          onChange={(label) => set({ label }, `label:${field.id}`)}
        />
        <TextRow
          label="Description"
          hideLabel
          multiline
          rows={1}
          placeholder="Add a description (optional)"
          inputClassName="min-h-10 resize-y"
          value={field.description ?? ""}
          onChange={(description) => set({ description }, `description:${field.id}`)}
        />
      </div>
      {answer.length ? (
        <section className="space-y-4 border-t pt-5" aria-labelledby={`${field.id}-answer`}>
          <SectionLabel id={`${field.id}-answer`}>Answer</SectionLabel>
          {answer}
        </section>
      ) : null}
      <SavesTo def={def} field={field} apply={apply} />
      <div className="space-y-3 border-t pt-5">
        {calculated ? null : (
          <SwitchRow
            label="Required"
            hint="People can't send the form without answering."
            checked={!!field.required}
            testID="builder-field-required"
            onChange={(required) => set({ required })}
          />
        )}
        {/* Read-only viewers can't press the trigger (the fieldset is disabled), so they see it open. */}
        <Collapsible defaultOpen={!!config.readOnly}>
          <CollapsibleTrigger
            className="group -ml-1 flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="builder-field-advanced"
          >
            <ChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            <span className="min-w-0 truncate">
              Advanced: answer name, identifies the respondent, sensitive
              {flagged.length ? <span className="text-foreground"> ({flagged.join(", ")})</span> : null}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4 rounded-md border p-3">
            <DraftRow
              label="Answer name"
              value={field.key}
              testID="builder-field-key"
              hint="Used as the column heading in exports. Changing it updates places that repeat this answer."
              onCommit={(key) => set({ key })}
            />
            <p className="text-xs text-muted-foreground">
              Optional: to repeat an earlier answer in this question, type {"{{field:its-answer-name}}"}.
            </p>
            <SwitchRow
              label="Identifies the respondent"
              hint={
                anonymous
                  ? "This form is anonymous, so this question is skipped."
                  : "Turn on for questions like name, email or phone. Skipped when the form is anonymous."
              }
              checked={!!field.identifying}
              onChange={(identifying) => set({ identifying })}
            />
            <SwitchRow
              label="Sensitive"
              hint="Hidden from share links and support tools."
              checked={!!field.sensitive}
              onChange={(sensitive) => set({ sensitive })}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

function OptionsEditor({ field, apply }: { field: FieldBlock; apply: Apply }) {
  const { readOnly } = useBuilderConfig();
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
            {readOnly ? null : (
            <>
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
            </>
            )}
          </li>
        ))}
      </ol>
      {readOnly ? null : (
        <Button
          variant="outline"
          size="sm"
          data-testid="builder-option-add"
          onClick={() => save([...options, { label: `Option ${options.length + 1}` }])}
        >
          <Plus /> Add option
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Answers store the value on the right, so a relabelled option keeps its earlier answers (they show the new label).
        Removing an option takes it out of “is one of” lists and removes the other rules that compare with it.
      </p>
    </fieldset>
  );
}

/**
 * "Saves to": the host's output targets for this field's type, grouped, as
 * checkboxes. Targets with different props can be on together; choosing one
 * replaces another with the same prop. "Nowhere else" turns them all off.
 */
function SavesTo({ def, field, apply }: { def: FormDefinition; field: FieldBlock; apply: Apply }) {
  const config = useBuilderConfig();
  const targets = outputsFor(config.outputs, field.type);
  if (!targets.length) return null;
  const chosen = new Set(chosenOutputs(field, targets).map((t) => t.id));
  const groups = new Map<string, OutputTarget[]>();
  for (const t of targets) groups.set(t.group ?? "", [...(groups.get(t.group ?? "") ?? []), t]);
  const ungrouped = groups.get("");
  groups.delete("");
  const sections: [string, OutputTarget[]][] = [...(ungrouped ? [["", ungrouped] as [string, OutputTarget[]]] : []), ...groups];
  return (
    <fieldset className="space-y-3 rounded-md border p-3" data-testid="builder-field-outputs">
      <legend className="px-1 text-sm font-medium">Saves to</legend>
      <p className="text-xs text-muted-foreground">Besides this form's responses, the answer can also go to:</p>
      <OutputOption
        id={`${field.id}-nowhere`}
        label="Nowhere else"
        checked={chosen.size === 0}
        testID="builder-output-none"
        onChange={(on) => {
          if (on) apply((d) => clearOutputs(d, field.id, config.outputs));
        }}
      />
      {sections.map(([group, list]) => (
        <div key={group || "-"} className="space-y-2" {...(group ? { role: "group", "aria-label": group } : {})}>
          {group ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</p> : null}
          {list.map((t) => {
            const other = outputUsedBy(def, field.id, t);
            const hint = [t.description, other && !chosen.has(t.id) ? `Now saved from “${other.label || other.key}”; choosing it here moves it.` : null]
              .filter(Boolean)
              .join(" ");
            return (
              <OutputOption
                key={t.id}
                id={`${field.id}-out-${t.id}`}
                label={t.label}
                hint={hint || undefined}
                checked={chosen.has(t.id)}
                testID={`builder-output-${t.id}`}
                onChange={(on) => apply((d) => setOutput(d, field.id, t, on))}
              />
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}

function OutputOption(props: { id: string; label: string; hint?: string | undefined; checked: boolean; testID: string; onChange: (on: boolean) => void }) {
  const hintId = `${props.id}-hint`;
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={props.id}
        checked={props.checked}
        data-testid={props.testID}
        aria-describedby={props.hint ? hintId : undefined}
        onCheckedChange={(v) => props.onChange(v === true)}
        className="mt-0.5"
      />
      <div className="space-y-0.5">
        <Label htmlFor={props.id} className="font-normal">
          {props.label}
        </Label>
        {props.hint ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {props.hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
