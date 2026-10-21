import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@marktiderman/genesis-ui/button";
import { Label } from "@marktiderman/genesis-ui/label";
import { Slider } from "@marktiderman/genesis-ui/slider";
import { Switch } from "@marktiderman/genesis-ui/switch";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";
import { replay, type FormEngine, type FormEvent, type Json } from "@marktiderman/genesis-forms";
import { validateSubmission } from "@marktiderman/genesis-forms/server";
import { useFormSelector } from "@marktiderman/genesis-forms-react";

export const pretty = (value: unknown) => JSON.stringify(value, null, 2);

export function JsonView({ value, className }: { value: unknown; className?: string }) {
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

// ── State ────────────────────────────────────────────────────────────────────

/** Live path, visibility, values and errors. Values are shown by field key. */
export function StatePanel({ engine }: { engine: FormEngine }) {
  const state = useFormSelector(engine, (s) => s);
  const byKey = Object.fromEntries(
    Object.entries(state.values).map(([id, v]) => [keyOf(engine, id), v === undefined ? null : v]),
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
      <JsonView value={{ status: state.status, ending: state.ending, values: byKey, errors: state.errors, hidden: state.hidden }} />
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

function describe(engine: FormEngine, event: FormEvent): string {
  if (event.type === "answer") return `answer ${keyOf(engine, event.field)} = ${JSON.stringify(event.value ?? null)}`;
  return event.type;
}

/**
 * The event log with time travel. Scrubbing replays the first N events into a
 * separate engine, so the live form is untouched; "Continue from here" hands
 * the prefix back to the host to restart the form at that point.
 */
export function TimelinePanel({
  engine,
  onFork,
}: {
  engine: FormEngine;
  onFork?: (events: FormEvent[]) => void;
}) {
  const events = useFormSelector(engine, (s) => s.events);
  const [cursor, setCursor] = useState<number | null>(null);
  const at = cursor === null ? events.length : Math.min(cursor, events.length);
  const past = useMemo(
    () => replay(engine.definition, events.slice(0, at), { hidden: engine.getState().hidden }),
    [engine, events, at],
  );
  const pastState = past.getState();

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
        {events.map((e, i) => (
          <li key={i} className={cn("rounded px-2 py-1", i < at ? "bg-muted" : "opacity-50")}>
            {i + 1}. {describe(engine, e)}
          </li>
        ))}
      </ol>
      <Row label="Path then">{pastState.path.map((id) => keyOf(past, id)).join(" → ")}</Row>
      <JsonView value={{ status: pastState.status, current: pastState.current && keyOf(past, pastState.current), answers: past.answers() }} />
    </div>
  );
}

// ── Server ───────────────────────────────────────────────────────────────────

/**
 * What the server would accept: the event log replayed against the
 * definition with server-resolved context. Tamper mode adds what a hostile
 * client might send (a forged server input, an unknown field, a value for a
 * hidden field) so you can see the server drop it.
 */
export function ServerPanel({ engine, context }: { engine: FormEngine; context: Record<string, Json> }) {
  const state = useFormSelector(engine, (s) => s);
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
      <JsonView value={result} />
    </div>
  );
}

// ── Context editor ───────────────────────────────────────────────────────────

/** Edit the server-resolved context (JSON). Calls `onChange` only with valid JSON objects. */
export function ContextEditor({
  value,
  onChange,
}: {
  value: Record<string, Json>;
  onChange: (next: Record<string, Json>) => void;
}) {
  const [text, setText] = useState(pretty(value));
  const [error, setError] = useState<string | null>(null);
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
          try {
            const parsed = JSON.parse(e.target.value) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Must be an object.");
            setError(null);
            onChange(parsed as Record<string, Json>);
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
