/**
 * Renderers for the structured field types: `list`, `table`, `media-notes`
 * and `text-highlights`. Each is a group (FieldChrome draws the fieldset and
 * legend); every control inside has its own visible or accessible name.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Stack } from "@marktiderman/genesis-ui/layout";
import { SortableList } from "@marktiderman/genesis-ui/sortable-list";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";
import {
  formatTimestamp,
  listLimits,
  parseTimestamp,
  tableColumns,
  tableLimits,
  type Highlight,
  type Json,
  type MediaNote,
} from "@marktiderman/genesis-forms";
import type { FieldRendererProps, RendererEntry } from "@marktiderman/genesis-forms-react";
import { FieldChrome } from "./chrome";
import { useSourceText, useMediaTime } from "./source";

// ── Shared ───────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/**
 * Stable React keys for the entries of a list value, which has none of its
 * own (two list items may hold the same text). Kept in step with every add,
 * remove and move; a value replaced from outside (a draft restored) just gets
 * keys for its new length.
 */
function useEntryKeys(count: number) {
  const keys = useRef<string[]>([]);
  const next = useRef(0);
  const make = () => `e${next.current++}`;
  while (keys.current.length < count) keys.current.push(make());
  if (keys.current.length > count) keys.current = keys.current.slice(0, count);
  return {
    keys: keys.current,
    /** Add a key at `at` and return it. */
    insert(at: number): string {
      const key = make();
      keys.current = [...keys.current.slice(0, at), key, ...keys.current.slice(at)];
      return key;
    },
    remove(at: number) {
      keys.current = keys.current.filter((_, i) => i !== at);
    },
    move(from: number, to: number) {
      keys.current = move(keys.current, from, to);
    },
  };
}

/** Focus the element registered under a key once it has rendered. */
function useFocusLater() {
  const elements = useRef(new Map<string, HTMLElement>());
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (target === null) return;
    elements.current.get(target)?.focus();
    setTarget(null);
  }, [target]);
  return {
    ref: (key: string) => (el: HTMLElement | null) => {
      if (el) elements.current.set(key, el);
      else elements.current.delete(key);
    },
    focus: setTarget,
  };
}

const invalid = (props: FieldRendererProps) => (props.binding.error ? true : undefined);

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick} className="shrink-0">
      <XIcon />
    </Button>
  );
}

function AddButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onClick} className="self-start">
      <PlusIcon /> {children}
    </Button>
  );
}

/** A short form of a passage, for labels ("Remove highlight “The quick brown…”"). */
function excerpt(text: string, max = 40): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ── list ─────────────────────────────────────────────────────────────────────

function ListField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const field = binding.field;
  const { max, itemMaxLength } = listLimits(field);
  const stored = Array.isArray(binding.value) ? binding.value.map((v) => (typeof v === "string" ? v : "")) : [];
  // An unanswered list still shows one empty line to type in.
  const items = stored.length ? stored : [""];
  const entries = useEntryKeys(items.length);
  const focusLater = useFocusLater();
  const addRef = useRef<HTMLButtonElement>(null);
  const placeholder =
    typeof field.props?.placeholder === "string" ? field.props.placeholder : (field.placeholder ?? undefined);
  const save = (next: string[]) => binding.setValue(next.length ? (next as Json) : undefined);

  const add = () => {
    if (items.length >= max) return;
    const key = entries.insert(items.length);
    save([...items, ""]);
    focusLater.focus(key);
  };
  const remove = (i: number) => {
    entries.remove(i);
    const next = items.filter((_, j) => j !== i);
    save(next);
    const neighbour = entries.keys[Math.min(i, next.length - 1)];
    if (neighbour !== undefined && next.length) focusLater.focus(neighbour);
    else addRef.current?.focus();
  };
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    if (i < items.length - 1) {
      e.preventDefault();
      focusLater.focus(entries.keys[i + 1]!);
    } else if (items.length < max) {
      // Enter in the last item starts the next one instead of moving on.
      e.preventDefault();
      add();
    }
  };

  const rows = items.map((text, index) => ({ key: entries.keys[index]!, text, index }));
  return (
    <FieldChrome props={props}>
      <Stack gap="sm">
        <SortableList
          items={rows}
          getKey={(r) => r.key}
          getItemLabel={(r) => (r.text.trim() ? excerpt(r.text, 30) : `Item ${r.index + 1}`)}
          label={`${binding.label}: items`}
          disabled={items.length < 2}
          onReorder={(from, to) => {
            entries.move(from, to);
            save(move(items, from, to));
          }}
          renderItem={(r, { handle, index }) => (
            <Stack direction="row" align="center" gap="sm" className="w-full min-w-0">
              {handle}
              <Input
                ref={focusLater.ref(r.key)}
                id={index === 0 ? `${inputId}-0` : undefined}
                data-gf-focus={index === 0 ? "" : undefined}
                aria-label={`Item ${index + 1}`}
                aria-invalid={invalid(props)}
                maxLength={itemMaxLength}
                placeholder={placeholder}
                value={r.text}
                onChange={(e) => save(items.map((t, j) => (j === index ? e.target.value : t)))}
                onKeyDown={onKeyDown(index)}
              />
              <RemoveButton
                label={`Remove item ${index + 1}`}
                disabled={items.length === 1 && r.text === ""}
                onClick={() => remove(index)}
              />
            </Stack>
          )}
        />
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={items.length >= max}
          onClick={add}
        >
          <PlusIcon /> Add item
        </Button>
      </Stack>
    </FieldChrome>
  );
}

// ── table ────────────────────────────────────────────────────────────────────

type Row = Record<string, string>;

function toRow(value: Json | undefined): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
}

function TableField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const columns = tableColumns(binding.field);
  const { minRows, maxRows } = tableLimits(binding.field);
  const stored = Array.isArray(binding.value) ? binding.value.map(toRow) : [];
  // Show at least the rows asked for (one when none are), never more than allowed.
  const shown = Math.min(Math.max(stored.length, minRows, 1), Math.max(maxRows, 1));
  const rows = Array.from({ length: shown }, (_, i) => stored[i] ?? {});
  const entries = useEntryKeys(rows.length);
  const focusLater = useFocusLater();
  const addRef = useRef<HTMLButtonElement>(null);
  const save = (next: Row[]) => binding.setValue(next.length ? (next as Json) : undefined);
  const firstKey = columns[0]?.key;

  const add = () => {
    if (rows.length >= maxRows) return;
    const key = entries.insert(rows.length);
    save([...rows, {}]);
    focusLater.focus(key);
  };
  const remove = (i: number) => {
    entries.remove(i);
    const next = rows.filter((_, j) => j !== i);
    save(next);
    const neighbour = entries.keys[Math.min(i, next.length - 1)];
    if (neighbour !== undefined && next.length) focusLater.focus(neighbour);
    else addRef.current?.focus();
  };

  if (!columns.length) {
    return (
      <FieldChrome props={props}>
        <p className="text-sm text-muted-foreground">This question has no columns yet.</p>
      </FieldChrome>
    );
  }
  const items = rows.map((row, index) => ({ key: entries.keys[index]!, row, index }));
  return (
    <FieldChrome props={props}>
      <Stack gap="md">
        <SortableList
          items={items}
          getKey={(r) => r.key}
          getItemLabel={(r) => `Row ${r.index + 1}`}
          label={`${binding.label}: rows`}
          disabled={rows.length < 2}
          onReorder={(from, to) => {
            entries.move(from, to);
            save(move(rows, from, to));
          }}
          renderItem={(r, { handle, index }) => (
            <Stack direction="row" align="start" gap="sm" className="w-full min-w-0">
              {handle ? <div className="pt-7">{handle}</div> : null}
              <fieldset className="m-0 min-w-0 flex-1 rounded-md border border-input p-3">
                <legend className="px-1 text-sm font-medium">{`Row ${index + 1}`}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {columns.map((column, c) => {
                    const id = `${inputId}-${r.key}-${column.key}`;
                    const common = {
                      id,
                      // The first cell of the first row is what an error summary link and the focus layout reach.
                      "data-gf-focus": index === 0 && c === 0 ? "" : undefined,
                      "aria-invalid": invalid(props),
                      value: r.row[column.key] ?? "",
                      maxLength: 2000,
                    } as const;
                    const set = (text: string) =>
                      save(rows.map((row, j) => (j === index ? { ...row, [column.key]: text } : row)));
                    return (
                      <div key={column.key} className={cn("space-y-1.5", column.long && "sm:col-span-2")}>
                        <Label htmlFor={id}>{column.label}</Label>
                        {column.long ? (
                          <Textarea
                            {...common}
                            ref={column.key === firstKey ? focusLater.ref(r.key) : undefined}
                            rows={2}
                            onChange={(e) => set(e.target.value)}
                          />
                        ) : (
                          <Input
                            {...common}
                            ref={column.key === firstKey ? focusLater.ref(r.key) : undefined}
                            onChange={(e) => set(e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <div className="pt-7">
                <RemoveButton
                  label={`Remove row ${index + 1}`}
                  disabled={rows.length <= Math.max(minRows, 1)}
                  onClick={() => remove(index)}
                />
              </div>
            </Stack>
          )}
        />
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={rows.length >= maxRows}
          onClick={add}
        >
          <PlusIcon /> Add row
        </Button>
      </Stack>
    </FieldChrome>
  );
}

// ── media-notes ──────────────────────────────────────────────────────────────

function toNote(value: Json): MediaNote {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { at: 0, text: "" };
  return { at: typeof value.at === "number" ? value.at : 0, text: typeof value.text === "string" ? value.text : "" };
}

function MediaNotesField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const media = useMediaTime();
  const maxNotes = typeof binding.field.props?.maxNotes === "number" ? binding.field.props.maxNotes : 20;
  const textMaxLength = typeof binding.field.props?.textMaxLength === "number" ? binding.field.props.textMaxLength : 1000;
  const notes = Array.isArray(binding.value) ? binding.value.map(toNote) : [];
  const entries = useEntryKeys(notes.length);
  const now = () => {
    const t = media?.currentTime?.();
    return typeof t === "number" && Number.isFinite(t) && t >= 0 ? formatTimestamp(t) : "";
  };
  const [time, setTime] = useState(now);
  // Once the respondent types a time, the player no longer overwrites it.
  const [timeTouched, setTimeTouched] = useState(false);
  const [text, setText] = useState("");
  const [timeError, setTimeError] = useState<string | null>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const save = (next: MediaNote[]) => binding.setValue(next.length ? (next as unknown as Json) : undefined);
  const full = notes.length >= maxNotes;
  const follow = () => {
    if (timeTouched || !media?.currentTime) return;
    const t = now();
    if (t) setTime(t);
  };

  const parsed = parseTimestamp(time);
  const add = () => {
    if (full || !text.trim()) return;
    const at = time.trim() === "" && !media?.currentTime ? 0 : parsed;
    if (at === null) {
      setTimeError("Enter a time like 1:23 or 1:02:03.");
      return;
    }
    // Keep notes in time order; a new note goes after others at the same moment.
    const at_ = notes.findIndex((n) => n.at > at);
    const index = at_ === -1 ? notes.length : at_;
    entries.insert(index);
    save([...notes.slice(0, index), { at, text: text.trim() }, ...notes.slice(index)]);
    setText("");
    setTimeError(null);
    setTimeTouched(false);
    setTime(now());
    textRef.current?.focus();
  };
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    // Enter adds the note rather than moving on to the next question.
    e.preventDefault();
    add();
  };
  const addLabel =
    media?.currentTime && parsed !== null ? `Add note at ${formatTimestamp(parsed)}` : "Add note";
  const timeId = `${inputId}-time`;
  const textId = `${inputId}-text`;

  return (
    <FieldChrome props={props}>
      <Stack gap="md">
        {notes.length ? (
          <ol aria-label={`${binding.label}: notes`} className="m-0 list-none space-y-2 p-0">
            {notes.map((note, index) => {
              const at = formatTimestamp(note.at);
              return (
                <li key={entries.keys[index]}>
                  <Stack direction="row" align="center" gap="sm">
                    {media?.seek ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="shrink-0 px-0 tabular-nums"
                        aria-label={`Play from ${at}`}
                        onClick={() => media.seek?.(note.at)}
                      >
                        {at}
                      </Button>
                    ) : (
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{at}</span>
                    )}
                    <Input
                      aria-label={`Note at ${at}`}
                      aria-invalid={invalid(props)}
                      maxLength={textMaxLength}
                      value={note.text}
                      onChange={(e) => save(notes.map((n, j) => (j === index ? { ...n, text: e.target.value } : n)))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                    />
                    <RemoveButton
                      label={`Remove note at ${at}`}
                      onClick={() => {
                        entries.remove(index);
                        save(notes.filter((_, j) => j !== index));
                        textRef.current?.focus();
                      }}
                    />
                  </Stack>
                </li>
              );
            })}
          </ol>
        ) : null}
        {full ? (
          <p className="text-sm text-muted-foreground">{`You've added the most notes this question takes (${maxNotes}).`}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={timeId}>Time</Label>
              <Input
                id={timeId}
                inputMode="numeric"
                placeholder="m:ss"
                value={time}
                aria-invalid={timeError ? true : undefined}
                aria-describedby={timeError ? `${timeId}-error` : undefined}
                onChange={(e) => {
                  setTime(e.target.value);
                  setTimeTouched(true);
                  setTimeError(null);
                }}
                onKeyDown={onEnter}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={textId}>Note</Label>
              <Input
                ref={textRef}
                id={textId}
                data-gf-focus=""
                maxLength={textMaxLength}
                value={text}
                onFocus={follow}
                onChange={(e) => {
                  if (!text) follow();
                  setText(e.target.value);
                }}
                onKeyDown={onEnter}
              />
            </div>
            <AddButton onClick={add} disabled={!text.trim()}>
              {addLabel}
            </AddButton>
            {timeError ? (
              <p id={`${timeId}-error`} className="text-sm text-destructive sm:col-span-3">
                {timeError}
              </p>
            ) : null}
          </div>
        )}
      </Stack>
    </FieldChrome>
  );
}

// ── text-highlights ──────────────────────────────────────────────────────────

function toHighlight(value: Json): Highlight | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { start, end, quote, note } = value;
  if (typeof start !== "number" || typeof end !== "number" || typeof quote !== "string") return null;
  return { start, end, quote, note: typeof note === "string" ? note : "" };
}

/** The text in pieces, each marked when some highlight covers it. */
function segments(text: string, highlights: readonly Highlight[]) {
  const cuts = new Set([0, text.length]);
  for (const h of highlights) {
    if (h.start >= 0 && h.end <= text.length && h.start < h.end) {
      cuts.add(h.start);
      cuts.add(h.end);
    }
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: { start: number; text: string; marked: boolean }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (end <= start) continue;
    out.push({ start, text: text.slice(start, end), marked: highlights.some((h) => h.start <= start && h.end >= end) });
  }
  return out;
}

/** The offset within `root`'s text of a DOM position inside it. */
function textOffset(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function TextHighlightsField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const hosted = useSourceText();
  const own = typeof binding.field.props?.text === "string" ? binding.field.props.text : "";
  const text = hosted ?? own;
  const maxHighlights =
    typeof binding.field.props?.maxHighlights === "number" ? binding.field.props.maxHighlights : 20;
  const highlights = (Array.isArray(binding.value) ? binding.value : []).flatMap((v) => {
    const h = toHighlight(v);
    return h ? [h] : [];
  });
  const entries = useEntryKeys(highlights.length);
  const textRef = useRef<HTMLParagraphElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [typing, setTyping] = useState(false);
  const [passage, setPassage] = useState("");
  const [note, setNote] = useState("");
  const full = highlights.length >= maxHighlights;
  const save = (next: Highlight[]) => binding.setValue(next.length ? (next as unknown as Json) : undefined);
  const hintId = useId();

  // The keyboard way: the first place the typed passage appears.
  const typed = passage.trim();
  const found = typing && typed ? text.indexOf(typed) : -1;
  const draft = typing ? (found >= 0 ? { start: found, end: found + typed.length } : null) : selection;

  const draftKey = draft ? `${draft.start}:${draft.end}` : "";
  const wasSelection = useRef(false);
  useEffect(() => {
    // A new selection moves focus to its note; a typed passage keeps focus where the typing is.
    if (draftKey && wasSelection.current) noteRef.current?.focus();
  }, [draftKey]);

  const readSelection = () => {
    const root = textRef.current;
    const sel = typeof window === "undefined" ? null : window.getSelection();
    if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed || full) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    let start = textOffset(root, range.startContainer, range.startOffset);
    let end = textOffset(root, range.endContainer, range.endOffset);
    if (start > end) [start, end] = [end, start];
    // Leave out the spaces a double-click or drag picks up at the edges.
    while (start < end && /\s/.test(text[start]!)) start++;
    while (end > start && /\s/.test(text[end - 1]!)) end--;
    if (end <= start) return;
    wasSelection.current = true;
    setTyping(false);
    setSelection({ start, end });
  };

  const reset = () => {
    setSelection(null);
    setPassage("");
    setNote("");
    setTyping(false);
    wasSelection.current = false;
  };
  const commit = () => {
    if (!draft || !note.trim() || full) return;
    const h: Highlight = { start: draft.start, end: draft.end, quote: text.slice(draft.start, draft.end), note: note.trim() };
    const at = highlights.findIndex((x) => x.start > h.start);
    const index = at === -1 ? highlights.length : at;
    entries.insert(index);
    save([...highlights.slice(0, index), h, ...highlights.slice(index)]);
    reset();
    window.getSelection?.()?.removeAllRanges();
    toggleRef.current?.focus();
  };

  if (!text) {
    return (
      <FieldChrome props={props}>
        <p className="text-sm text-muted-foreground">There is no passage to highlight.</p>
      </FieldChrome>
    );
  }

  return (
    <FieldChrome props={props}>
      <Stack gap="md">
        <p
          ref={textRef}
          id={`${inputId}-text`}
          aria-describedby={hintId}
          className="m-0 whitespace-pre-wrap rounded-md border border-input bg-muted/30 p-3 text-base leading-relaxed"
          onMouseUp={readSelection}
          onTouchEnd={readSelection}
          onKeyUp={readSelection}
        >
          {segments(text, highlights).map((s) =>
            s.marked ? (
              <mark key={s.start} className="rounded-sm bg-primary/20 text-foreground">
                {s.text}
              </mark>
            ) : (
              <span key={s.start}>{s.text}</span>
            ),
          )}
        </p>
        <p id={hintId} className="m-0 text-sm text-muted-foreground">
          {full
            ? `You've added the most highlights this question takes (${maxHighlights}).`
            : "Select words in the passage to highlight them, or use Highlight a passage to type them."}
        </p>
        {!full ? (
          <Button
            ref={toggleRef}
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            aria-expanded={typing}
            onClick={() => {
              setSelection(null);
              wasSelection.current = false;
              setTyping((t) => !t);
            }}
          >
            Highlight a passage
          </Button>
        ) : null}
        {typing && !full ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${inputId}-passage`}>Passage</Label>
            <Input
              id={`${inputId}-passage`}
              value={passage}
              aria-describedby={`${inputId}-passage-hint`}
              aria-invalid={typed && found < 0 ? true : undefined}
              onChange={(e) => setPassage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (found >= 0) noteRef.current?.focus();
                }
              }}
            />
            <p id={`${inputId}-passage-hint`} className="m-0 text-sm text-muted-foreground">
              {typed && found < 0 ? "Not found in the passage. Type the words exactly as they appear." : "Type the words exactly as they appear."}
            </p>
          </div>
        ) : null}
        {draft && !full ? (
          <div role="group" aria-label="New highlight" className="space-y-2 rounded-md border border-input p-3">
            <blockquote className="m-0 border-l-2 border-primary pl-3 text-sm">
              <mark className="bg-primary/20 text-foreground">{text.slice(draft.start, draft.end)}</mark>
            </blockquote>
            <Label htmlFor={`${inputId}-note`}>Your note</Label>
            <Textarea
              ref={noteRef}
              id={`${inputId}-note`}
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Stack direction="row" gap="sm">
              <Button type="button" size="sm" disabled={!note.trim()} onClick={commit}>
                Highlight
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            </Stack>
          </div>
        ) : null}
        {highlights.length ? (
          <ol aria-label={`${binding.label}: highlights`} className="m-0 list-none space-y-3 p-0">
            {highlights.map((h, index) => {
              const name = `“${excerpt(h.quote)}”`;
              return (
                <li key={entries.keys[index]} className="space-y-1.5">
                  <blockquote className="m-0 border-l-2 border-primary pl-3 text-sm">{h.quote}</blockquote>
                  <Stack direction="row" align="center" gap="sm">
                    <Input
                      aria-label={`Note on ${name}`}
                      aria-invalid={invalid(props) || (h.note.trim() ? undefined : true)}
                      maxLength={1000}
                      value={h.note}
                      onChange={(e) => save(highlights.map((x, j) => (j === index ? { ...x, note: e.target.value } : x)))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                    />
                    <RemoveButton
                      label={`Remove highlight ${name}`}
                      onClick={() => {
                        entries.remove(index);
                        save(highlights.filter((_, j) => j !== index));
                        toggleRef.current?.focus();
                      }}
                    />
                  </Stack>
                </li>
              );
            })}
          </ol>
        ) : null}
      </Stack>
    </FieldChrome>
  );
}

export const structuredRenderers: RendererEntry[] = [
  { type: "list", Component: ListField },
  { type: "table", Component: TableField },
  { type: "media-notes", Component: MediaNotesField },
  { type: "text-highlights", Component: TextHighlightsField },
];
