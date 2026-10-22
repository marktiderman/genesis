import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@marktiderman/genesis-ui/button";
import { Label } from "@marktiderman/genesis-ui/label";
import { Slider } from "@marktiderman/genesis-ui/slider";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";
import { replay, type FormEngine, type FormEvent, type Json } from "@marktiderman/genesis-forms";
import { validateSubmission } from "@marktiderman/genesis-forms/server";
import { useFormSelector } from "@marktiderman/genesis-forms-react";
import { SENSITIVE_MASK, isPrefix, maskRecord, sensitiveHiddenNames, sensitiveIds } from "./util";

export interface PrettyOptions {
  /** Objects and arrays deeper than this are shown as a placeholder. Default 24. */
  maxDepth?: number | undefined;
  /** Items shown per array or object. Default 1,000. */
  maxItems?: number | undefined;
  /** Characters of output before it is cut. Default 100,000. */
  maxChars?: number | undefined;
  /** JSON indentation. Default 2. */
  indent?: number | undefined;
}

function cap(value: unknown, depth: number, o: Required<PrettyOptions>, ancestors: Set<object>): unknown {
  if (value && typeof value === "object" && typeof (value as { toJSON?: unknown }).toJSON === "function") {
    value = (value as { toJSON: () => unknown }).toJSON();
  }
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) return "[circular]";
  if (depth >= o.maxDepth) return Array.isArray(value) ? "[… nested too deep]" : "{… nested too deep}";
  ancestors.add(value);
  let out: unknown;
  if (Array.isArray(value)) {
    const items = value.slice(0, o.maxItems).map((v) => cap(v, depth + 1, o, ancestors));
    if (value.length > o.maxItems) items.push(`… ${value.length - o.maxItems} more items`);
    out = items;
  } else {
    const entries = Object.entries(value);
    const obj: Record<string, unknown> = {};
    for (const [k, v] of entries.slice(0, o.maxItems)) obj[k] = cap(v, depth + 1, o, ancestors);
    if (entries.length > o.maxItems) obj["…"] = `${entries.length - o.maxItems} more keys`;
    out = obj;
  }
  ancestors.delete(value);
  return out;
}

/**
 * JSON for display. Deep, wide, circular or huge values are cut with a note
 * instead of throwing or freezing the page (a share link can carry anything).
 */
export const pretty = (value: unknown, options: PrettyOptions = {}): string => {
  const o = { maxDepth: 24, maxItems: 1000, maxChars: 100_000, indent: 2, ...options };
  let text: string;
  try {
    text = JSON.stringify(cap(value, 0, o, new Set()), null, o.indent);
  } catch (err) {
    return `[could not display this value: ${(err as Error).message}]`;
  }
  if (text !== undefined && text.length > o.maxChars) {
    text = `${text.slice(0, o.maxChars)}\n… truncated (${text.length - o.maxChars} more characters)`;
  }
  return text;
};

export function JsonView({ value, className }: { value: unknown; className?: string | undefined }) {
  return <pre className={cn("max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs", className)}>{pretty(value)}</pre>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="text-sm">
      <span className="font-medium">{label}:</span> {children}
    </p>
  );
}

const keyOf = (engine: FormEngine, id: string) => engine.field(id)?.key ?? id;

const useSensitive = (engine: FormEngine) => useMemo(() => sensitiveIds(engine.definition), [engine.definition]);
const useSensitiveHidden = (engine: FormEngine) =>
  useMemo(() => sensitiveHiddenNames(engine.definition), [engine.definition]);

// ── State ────────────────────────────────────────────────────────────────────

/**
 * Live path, visibility, values and errors. Values are shown by field key;
 * sensitive values are masked unless `reveal` is set.
 */
export function StatePanel({ engine, reveal = false }: { engine: FormEngine; reveal?: boolean | undefined }) {
  const state = useFormSelector(engine, (s) => s);
  const sensitive = useSensitive(engine);
  const sensitiveHidden = useSensitiveHidden(engine);
  const values = reveal ? state.values : maskRecord(state.values, sensitive);
  const hidden = reveal ? state.hidden : maskRecord(state.hidden, sensitiveHidden);
  const byKey = Object.fromEntries(
    Object.entries(values).map(([id, v]) => [keyOf(engine, id), v === undefined ? null : v]),
  );
  return (
    <div className="space-y-3" data-testid="devtools-state">
      <Row label="Path">{state.path.map((id) => keyOf(engine, id)).join(" → ") || "—"}</Row>
      <Row label="Visible">
        {state.path
          .filter((id) => engine.field(id) && engine.isVisible(id))
          .map((id) => keyOf(engine, id))
          .join(", ") || "—"}
      </Row>
      <Row label="On screen">{state.current ? keyOf(engine, state.current) : "—"}</Row>
      <JsonView value={{ status: state.status, ending: state.ending, values: byKey, errors: state.errors, hidden }} />
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

/** Events listed before the rest collapse behind "N earlier events". */
const TIMELINE_LIMIT = 200;

function describe(engine: FormEngine, event: FormEvent, masked: Set<string>): string {
  if (event.type !== "answer") return event.type;
  const value =
    masked.has(event.field) && event.value !== undefined && event.value !== null
      ? SENSITIVE_MASK
      : pretty(event.value ?? null, { maxDepth: 4, maxItems: 20, maxChars: 200, indent: 0 });
  return `answer ${keyOf(engine, event.field)} = ${value}`;
}

/**
 * The event log with time travel. Scrubbing replays the first N events into a
 * separate engine, so the live form is untouched; "Continue from here" hands
 * the prefix back to the host to restart the form at that point. The cursor
 * resets when the log is replaced (a restart, a fork, a loaded link) rather
 * than extended.
 */
export function TimelinePanel({
  engine,
  onFork,
  reveal = false,
}: {
  engine: FormEngine;
  onFork?: ((events: FormEvent[]) => void) | undefined;
  reveal?: boolean | undefined;
}) {
  const events = useFormSelector(engine, (s) => s.events);
  const sensitive = useSensitive(engine);
  const masked = reveal ? new Set<string>() : sensitive;
  // The cursor remembers the log it was set against.
  const [scrub, setScrub] = useState<{ cursor: number; log: FormEvent[] } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const stale = useMemo(() => scrub !== null && !isPrefix(scrub.log, events), [scrub, events]);
  if (stale) setScrub(null);
  const cursor = scrub && !stale ? scrub.cursor : null;
  const setCursor = (next: number | null) => setScrub(next === null ? null : { cursor: next, log: events });

  const at = cursor === null ? events.length : Math.min(cursor, events.length);
  const live = at === events.length;
  const past = useMemo(
    () => (live ? engine : replay(engine.definition, events.slice(0, at), { hidden: engine.getState().hidden })),
    [engine, events, at, live],
  );
  const pastState = past.getState();
  const start = showAll ? 0 : Math.max(0, events.length - TIMELINE_LIMIT);

  return (
    <div className="space-y-3" data-testid="devtools-timeline">
      <div className="space-y-2">
        <Label>
          Event {at} of {events.length}
          {cursor !== null && at < events.length ? " (scrubbing)" : ""}
        </Label>
        <Slider
          min={0}
          max={Math.max(events.length, 1)}
          step={1}
          value={[at]}
          onValueChange={([v]) => setCursor(v === events.length ? null : (v ?? null))}
          aria-label="Scrub through events"
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCursor(Math.max(0, at - 1))} disabled={at === 0}>
            Step back
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(at + 1 >= events.length ? null : at + 1)} disabled={at >= events.length}>
            Step forward
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(null)} disabled={cursor === null}>
            Live
          </Button>
          {onFork ? (
            <Button
              size="sm"
              onClick={() => {
                onFork(events.slice(0, at));
                setCursor(null);
              }}
              disabled={at === events.length}
            >
              Continue from here
            </Button>
          ) : null}
        </div>
      </div>
      <ol className="max-h-48 space-y-1 overflow-auto text-xs font-mono">
        {start > 0 ? (
          <li>
            <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setShowAll(true)}>
              {start} earlier events (show all)
            </Button>
          </li>
        ) : null}
        {events.slice(start).map((e, j) => {
          const i = start + j;
          return (
            <li key={i} className={cn("rounded px-2 py-1", i < at ? "bg-muted" : "opacity-50")}>
              {i + 1}. {describe(engine, e, masked)}
            </li>
          );
        })}
      </ol>
      <Row label="Path then">{pastState.path.map((id) => keyOf(past, id)).join(" → ")}</Row>
      <JsonView
        value={{
          status: pastState.status,
          current: pastState.current && keyOf(past, pastState.current),
          answers: maskRecord(past.answers(), masked),
        }}
      />
    </div>
  );
}

// ── Server ───────────────────────────────────────────────────────────────────

/**
 * What the server would accept: the event log replayed against the
 * definition with server-resolved context. Tamper mode adds what a hostile
 * client might send (a forged server input, an unknown field, a value for a
 * hidden field) so you can see the server drop it. Sensitive answers are
 * masked unless `reveal` is set.
 */
export function ServerPanel({
  engine,
  context,
  reveal = false,
}: {
  engine: FormEngine;
  context: Record<string, Json>;
  reveal?: boolean | undefined;
}) {
  const state = useFormSelector(engine, (s) => s);
  const sensitive = useSensitive(engine);
  const sensitiveHidden = useSensitiveHidden(engine);
  const [tamper, setTamper] = useState(false);
  const result = useMemo(() => {
    const serverInputs = (engine.definition.hidden ?? []).filter((h) => h.source === "server");
    const hiddenFields = engine.definition.blocks.filter((b) => b.kind === "field" && !engine.isVisible(b.id));
    const events: FormEvent[] = tamper
      ? [
          ...state.events.filter((e) => e.type !== "submit"),
          { type: "answer", field: "__forged_field__", value: "x" },
          ...hiddenFields.slice(0, 1).map((b): FormEvent => ({ type: "answer", field: b.id, value: "smuggled" })),
          ...state.events.filter((e) => e.type === "submit"),
        ]
      : state.events;
    const hidden = tamper ? Object.fromEntries(serverInputs.map((h) => [h.name, "forged-by-client"])) : {};
    return validateSubmission(engine.definition, { events, hidden }, { context, complete: state.status === "completed" });
  }, [engine, state, context, tamper]);

  const client = engine.answers();
  const accepted = result.ok ? result.submission.answers : {};
  const differs = result.ok && JSON.stringify(client) !== JSON.stringify(accepted);
  const shown =
    reveal || !result.ok
      ? result
      : {
          ...result,
          submission: {
            ...result.submission,
            answers: maskRecord(result.submission.answers, sensitive),
            hidden: maskRecord(result.submission.hidden, sensitiveHidden),
            context: maskRecord(result.submission.context, sensitiveHidden),
          },
        };

  return (
    <div className="space-y-3" data-testid="devtools-server">
      <div className="flex items-center gap-2">
        <Switch id="gf-tamper" checked={tamper} onCheckedChange={setTamper} />
        <Label htmlFor="gf-tamper">Tamper mode: send what a hostile client might</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        {state.status === "completed" ? "Checked as a completed submission." : "Checked as a draft until the form is submitted."}{" "}
        {differs ? "The server stores something different from the client's answers." : ""}
      </p>
      <JsonView value={shown} />
    </div>
  );
}

// ── Context editor ───────────────────────────────────────────────────────────

/**
 * Edit the server-resolved context (JSON). Calls `onChange` only with valid
 * JSON objects, once typing pauses for `debounceMs` (default 400).
 */
export function ContextEditor({
  value,
  onChange,
  debounceMs = 400,
}: {
  value: Record<string, Json>;
  onChange: (next: Record<string, Json>) => void;
  debounceMs?: number | undefined;
}) {
  const [text, setText] = useState(() => pretty(value));
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="space-y-1">
      <Label htmlFor="gf-context">Server context</Label>
      <Textarea
        id="gf-context"
        className="font-mono text-xs"
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          clearTimeout(timer.current);
          try {
            const parsed = JSON.parse(e.target.value) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Must be an object.");
            setError(null);
            timer.current = setTimeout(() => latest.current(parsed as Record<string, Json>), debounceMs);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
