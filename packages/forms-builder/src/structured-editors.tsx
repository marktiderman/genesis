/**
 * The builder's own editors for the structured field types (list, table,
 * media-notes, text-highlights) and the photo type: a palette icon and a
 * settings panel each.
 * A host's `fieldEditors` entry for the same type replaces these.
 */
import { Camera, Clock, Highlighter, List, Plus, Rows3, X } from "lucide-react";
import {
  DEFAULT_PHOTO_FILES,
  DEFAULT_PHOTO_SIZE_MB,
  MAX_PHOTO_FILES,
  MAX_PHOTO_SIZE_MB,
  MAX_TABLE_COLUMNS,
  PHOTO_FORMATS,
  photoLimits,
  tableColumns,
  type Json,
  type PhotoFormat,
  type TableColumn,
} from "@marktiderman/genesis-forms";
import { Checkbox } from "@marktiderman/genesis-ui/checkbox";
import { Label } from "@marktiderman/genesis-ui/label";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { SortableList } from "@marktiderman/genesis-ui/sortable-list";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { CALCULATED_FIELD_EDITOR } from "./calculated-editor";
import { DraftInput, NumberRow, TextRow } from "./controls";
import type { FieldPanelProps, FieldTypeEditor } from "./editors";
import { slugKey, uniqueName } from "./ops";

const intProp = (props: FieldPanelProps["field"]["props"], name: string) =>
  typeof props?.[name] === "number" ? (props[name] as number) : undefined;

/** A whole number of at least `floor`, or undefined to fall back to the type's default. */
const atLeast = (n: number | undefined, floor: number) => (n === undefined ? undefined : Math.max(floor, n));

function ListPanel({ field, setProps }: FieldPanelProps) {
  const min = intProp(field.props, "min");
  const max = intProp(field.props, "max");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberRow
          label="Fewest items"
          commitOnBlur
          value={min}
          hint="Leave empty for none."
          onChange={(n) => setProps({ min: n && n > 0 ? Math.min(n, max ?? 10) : undefined })}
        />
        <NumberRow
          label="Most items"
          commitOnBlur
          value={max}
          hint="Leave empty for 10."
          onChange={(n) => {
            const next = atLeast(n, Math.max(1, min ?? 1));
            setProps({ max: next });
          }}
        />
      </div>
      <TextRow
        label="Placeholder"
        value={typeof field.props?.placeholder === "string" ? field.props.placeholder : ""}
        hint="Shown in each empty line."
        onChange={(placeholder) => setProps({ placeholder: placeholder || undefined }, `placeholder:${field.id}`)}
      />
    </div>
  );
}

function TablePanel({ field, setProps }: FieldPanelProps) {
  const columns = tableColumns(field);
  const minRows = intProp(field.props, "minRows");
  const maxRows = intProp(field.props, "maxRows");
  const save = (next: TableColumn[], coalesce?: string) =>
    setProps({ columns: next.map((c): Json => (c.long ? { key: c.key, label: c.label, long: true } : { key: c.key, label: c.label })) }, coalesce);
  const keysExcept = (i: number) => columns.filter((_, j) => j !== i).map((c) => c.key);
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Columns</legend>
        <SortableList
          items={columns}
          getKey={(c) => c.key}
          getItemLabel={(c) => c.label || c.key}
          label="Columns"
          disabled={columns.length < 2}
          onReorder={(from, to) => {
            const next = columns.slice();
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved!);
            save(next);
          }}
          renderItem={(column, { handle, index }) => (
            <div className="flex flex-wrap items-center gap-2">
              {handle}
              <Input
                aria-label={`Column ${index + 1} label`}
                className="min-w-32 flex-1"
                value={column.label}
                onChange={(e) =>
                  save(
                    columns.map((c, j) => (j === index ? { ...c, label: e.target.value } : c)),
                    `column-label:${field.id}:${column.key}`,
                  )
                }
              />
              <DraftInput
                ariaLabel={`Column ${index + 1} key`}
                className="w-28"
                value={column.key}
                onCommit={(raw) => {
                  const key = uniqueName(slugKey(raw, "column"), keysExcept(index));
                  save(columns.map((c, j) => (j === index ? { ...c, key } : c)));
                }}
              />
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={!!column.long}
                  aria-label={`Column ${index + 1} long answer`}
                  onCheckedChange={(long) =>
                    save(columns.map((c, j) => (j === index ? (long ? { ...c, long: true } : { key: c.key, label: c.label }) : c)))
                  }
                />
                <span aria-hidden="true">Long</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove column ${index + 1}`}
                disabled={columns.length <= 1}
                onClick={() => save(columns.filter((_, j) => j !== index))}
              >
                <X />
              </Button>
            </div>
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="builder-column-add"
          disabled={columns.length >= MAX_TABLE_COLUMNS}
          onClick={() => {
            const n = columns.length + 1;
            save([...columns, { key: uniqueName(`column_${n}`, columns.map((c) => c.key)), label: `Column ${n}` }]);
          }}
        >
          <Plus /> Add column
        </Button>
        <p className="text-xs text-muted-foreground">
          {`Up to ${MAX_TABLE_COLUMNS} columns. Answers are stored by key, so renaming a key on a live form leaves earlier answers under the old one.`}
        </p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberRow
          label="Fewest rows"
          commitOnBlur
          value={minRows}
          hint="Rows the respondent must fill in when answering."
          onChange={(n) => setProps({ minRows: n && n > 0 ? Math.min(n, maxRows ?? 3) : undefined })}
        />
        <NumberRow
          label="Most rows"
          commitOnBlur
          value={maxRows}
          hint="Leave empty for 3."
          onChange={(n) => setProps({ maxRows: atLeast(n, Math.max(1, minRows ?? 1)) })}
        />
      </div>
    </div>
  );
}

function MediaNotesPanel({ field, setProps }: FieldPanelProps) {
  return (
    <NumberRow
      label="Most notes"
      commitOnBlur
      value={intProp(field.props, "maxNotes")}
      hint="Leave empty for 20. The app hosting the form links notes to its media player."
      onChange={(n) => setProps({ maxNotes: atLeast(n, 1) })}
    />
  );
}

function TextHighlightsPanel({ field, setProps }: FieldPanelProps) {
  return (
    <div className="space-y-4">
      <TextRow
        label="Passage"
        multiline
        value={typeof field.props?.text === "string" ? field.props.text : ""}
        hint="The text respondents highlight. Leave empty when the app hosting the form supplies it."
        onChange={(text) => setProps({ text: text || undefined }, `text:${field.id}`)}
      />
      <NumberRow
        label="Most highlights"
        commitOnBlur
        value={intProp(field.props, "maxHighlights")}
        hint="Leave empty for 20."
        onChange={(n) => setProps({ maxHighlights: atLeast(n, 1) })}
      />
    </div>
  );
}

const FORMAT_LABELS: Record<PhotoFormat, string> = { jpeg: "JPEG", png: "PNG", heic: "HEIC (iPhone)", webp: "WebP" };
const ALL_FORMATS = Object.keys(PHOTO_FORMATS) as PhotoFormat[];
/** A whole number from `min` to `max`, or undefined to fall back to the type's default. */
const within = (n: number | undefined, min: number, max: number) =>
  n === undefined ? undefined : Math.min(max, Math.max(min, Math.round(n)));

function PhotoPanel({ field, setProps }: FieldPanelProps) {
  const { formats } = photoLimits(field);
  const chosen = new Set(formats);
  const id = `photo-formats-${field.id}`;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberRow
          label="Most photos"
          commitOnBlur
          min={1}
          max={MAX_PHOTO_FILES}
          value={intProp(field.props, "maxFiles")}
          hint={`1 to ${MAX_PHOTO_FILES}. Leave empty for ${DEFAULT_PHOTO_FILES}.`}
          onChange={(n) => setProps({ maxFiles: within(n, 1, MAX_PHOTO_FILES) })}
        />
        <NumberRow
          label="Largest photo (MB)"
          commitOnBlur
          min={1}
          max={MAX_PHOTO_SIZE_MB}
          value={intProp(field.props, "maxSizeMb")}
          hint={`1 to ${MAX_PHOTO_SIZE_MB}. Leave empty for ${DEFAULT_PHOTO_SIZE_MB}.`}
          onChange={(n) => setProps({ maxSizeMb: within(n, 1, MAX_PHOTO_SIZE_MB) })}
        />
      </div>
      <fieldset className="space-y-2" aria-describedby={`${id}-hint`}>
        <legend className="text-sm font-medium">Formats</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {ALL_FORMATS.map((format) => {
            const checked = chosen.has(format);
            return (
              <div key={format} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${format}`}
                  checked={checked}
                  // At least one format stays on.
                  disabled={checked && chosen.size === 1}
                  onCheckedChange={(on) => {
                    const next = ALL_FORMATS.filter((f) => (f === format ? on === true : chosen.has(f)));
                    // All four is the default, so it is stored as no prop.
                    setProps({ formats: next.length === ALL_FORMATS.length ? undefined : next });
                  }}
                />
                <Label htmlFor={`${id}-${format}`} className="font-normal">
                  {FORMAT_LABELS[format]}
                </Label>
              </div>
            );
          })}
        </div>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          The app hosting the form stores the photos; the answer keeps only a reference to each.
        </p>
      </fieldset>
    </div>
  );
}

const icon = "size-4 text-muted-foreground";

/** The builder's editors for the built-in structured types and the calculated type. */
export const BUILT_IN_FIELD_EDITORS: readonly FieldTypeEditor[] = [
  { type: "list", icon: <List className={icon} aria-hidden="true" />, Panel: ListPanel },
  { type: "table", icon: <Rows3 className={icon} aria-hidden="true" />, Panel: TablePanel },
  { type: "media-notes", icon: <Clock className={icon} aria-hidden="true" />, Panel: MediaNotesPanel },
  { type: "text-highlights", icon: <Highlighter className={icon} aria-hidden="true" />, Panel: TextHighlightsPanel },
  { type: "photo", icon: <Camera className={icon} aria-hidden="true" />, Panel: PhotoPanel },
  CALCULATED_FIELD_EDITOR,
];
