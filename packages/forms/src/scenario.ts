/**
 * Scenarios: a definition, an event log and the expected outcome, as one JSON
 * file. The same file runs in this package's tests, in an app's CI and in the
 * playground, so every runtime is held to the same behaviour.
 */
import { replay, type FormEngine, type FormState } from "./engine";
import { canonicalJson } from "./hash";
import { fieldMap } from "./logic";
import { validateSubmission } from "./server";
import type { FormDefinition, FormEvent, Json } from "./types";

export interface ScenarioExpectation {
  /** Keys (block ids for content) on the respondent's path. */
  path?: string[];
  /** Keys of the visible fields, in path order. */
  visible?: string[];
  /** Key of the block in focus (focus layout). */
  current?: string | null;
  status?: "in_progress" | "completed";
  ending?: string | null;
  /** `engine.answers()`, by key. */
  answers?: Record<string, Json>;
  /** Keys of the fields with an error on the client after the last event. */
  errors?: string[];
  /** What `validateSubmission(definition, { events, hidden }, { context })` returns. */
  server?: {
    ok: boolean;
    /** Stored answers, by key. */
    answers?: Record<string, Json>;
    context?: Record<string, Json>;
    /** Keys of the fields the server rejected. */
    errors?: string[];
    /** `submission.ignored`: dropped field ids and `hidden.<name>` entries. */
    ignored?: string[];
    /** Check as a completed response. Default: whether the replay completed. */
    complete?: boolean;
  };
}

export interface Scenario {
  /** Version of the scenario format. */
  scenarioVersion: 1;
  name: string;
  description?: string;
  tags?: string[];
  definition: FormDefinition;
  /** URL and host inputs, as the client sends them. */
  hidden?: Record<string, Json>;
  /** Server inputs, resolved by the server (and given to the client when the form loads). */
  context?: Record<string, Json>;
  /** The respondent's event log. Answer events name fields by id. */
  events: FormEvent[];
  expect: ScenarioExpectation;
}

export interface ScenarioResult {
  pass: boolean;
  failures: string[];
  state: FormState;
}

/**
 * Merge consecutive answer events to the same field, keeping the last value.
 * Text inputs log one event per keystroke; the merged log replays to the same
 * state, because the path is derived from values alone.
 */
export function compactEvents(events: FormEvent[]): FormEvent[] {
  const out: FormEvent[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    if (event.type === "answer" && last?.type === "answer" && last.field === event.field) {
      out[out.length - 1] = event;
    } else out.push(event);
  }
  return out;
}

function keyed(def: FormDefinition) {
  const fields = fieldMap(def);
  const keyOf = (id: string) => fields.get(id)?.key ?? id;
  const byKey = (record: Record<string, Json>) =>
    Object.fromEntries(Object.entries(record).map(([id, v]) => [keyOf(id), v]));
  return { fields, keyOf, byKey };
}

function snapshot(engine: FormEngine) {
  const { keyOf, byKey } = keyed(engine.definition);
  const state = engine.getState();
  return {
    path: state.path.map(keyOf),
    visible: state.path.filter((id) => engine.field(id) && engine.isVisible(id)).map(keyOf),
    current: state.current === null ? null : keyOf(state.current),
    status: state.status,
    ending: state.ending,
    answers: byKey(engine.answers()),
    errors: Object.keys(state.errors).map(keyOf),
  };
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const sorted = (xs: string[]) => [...xs].sort();

/** Replay a scenario's events (no clock) and compare against its expectations. */
export function runScenario(scenario: Scenario): ScenarioResult {
  const failures: string[] = [];
  if (scenario.scenarioVersion !== 1) {
    failures.push(`scenarioVersion ${String(scenario.scenarioVersion)} is not supported (expected 1).`);
  }
  const { definition, expect } = scenario;
  const engine = replay(definition, scenario.events, {
    hidden: { ...(scenario.hidden ?? {}), ...(scenario.context ?? {}) },
  });
  const actual = snapshot(engine);
  const check = (label: string, expected: unknown, got: unknown) => {
    if (expected !== undefined && !same(expected, got)) {
      failures.push(`${label}: expected ${canonicalJson(expected)}, got ${canonicalJson(got)}`);
    }
  };
  check("path", expect.path, actual.path);
  check("visible", expect.visible, actual.visible);
  check("current", expect.current, actual.current);
  check("status", expect.status, actual.status);
  check("ending", expect.ending, actual.ending);
  check("answers", expect.answers, actual.answers);
  if (expect.errors) check("errors", sorted(expect.errors), sorted(actual.errors));

  if (expect.server) {
    const { keyOf, byKey } = keyed(definition);
    const complete = expect.server.complete ?? actual.status === "completed";
    const result = validateSubmission(
      definition,
      { events: scenario.events, hidden: scenario.hidden },
      { context: scenario.context, complete },
    );
    check("server.ok", expect.server.ok, result.ok);
    if (result.ok) {
      check("server.answers", expect.server.answers, byKey(result.submission.answers));
      check("server.context", expect.server.context, result.submission.context);
      if (expect.server.ignored) {
        check("server.ignored", sorted(expect.server.ignored), sorted(result.submission.ignored));
      }    } else if (expect.server.errors) {
      check("server.errors", sorted(expect.server.errors), sorted(Object.keys(result.errors).map(keyOf)));
    }
  }
  return { pass: failures.length === 0, failures, state: engine.getState() };
}

export interface RecordScenarioOptions {
  description?: string;
  tags?: string[];
  /** URL and host inputs. Default: the engine's non-server hidden values. */
  hidden?: Record<string, Json>;
  /** Server inputs. Default: the engine's values for `source: "server"` inputs. */
  context?: Record<string, Json>;
  /** Record the server's verdict too. Default true. */
  server?: boolean;
  /** Merge keystroke-level answer events with `compactEvents`. Default true. */
  compact?: boolean;
}

/** Freeze a live engine as a scenario, with expectations filled from its current state. */
export function recordScenario(engine: FormEngine, name: string, opts: RecordScenarioOptions = {}): Scenario {
  const definition = JSON.parse(JSON.stringify(engine.definition)) as FormDefinition;
  const state = engine.getState();
  const sources = new Map((definition.hidden ?? []).map((h) => [h.name, h.source]));
  const split = (server: boolean) =>
    Object.fromEntries(
      Object.entries(state.hidden).filter(
        (e): e is [string, Json] => e[1] !== undefined && (sources.get(e[0]) === "server") === server,
      ),
    );
  const hidden = opts.hidden ?? split(false);
  const context = opts.context ?? split(true);

  const raw = opts.compact === false ? state.events : compactEvents(state.events);
  // No timestamps: scenarios replay with the clock off and must diff cleanly.
  const events = raw.map(({ at: _at, ...e }) => JSON.parse(JSON.stringify(e)) as FormEvent);

  const actual = snapshot(engine);
  const scenario: Scenario = {
    scenarioVersion: 1,
    name,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.tags ? { tags: opts.tags } : {}),
    definition,
    ...(Object.keys(hidden).length ? { hidden } : {}),
    ...(Object.keys(context).length ? { context } : {}),
    events,
    expect: {
      path: actual.path,
      visible: actual.visible,
      current: actual.current,
      status: actual.status,
      ending: actual.ending,
      answers: actual.answers,
      ...(actual.errors.length ? { errors: actual.errors } : {}),
    },
  };

  if (opts.server !== false) {
    const { keyOf, byKey } = keyed(definition);
    const result = validateSubmission(
      definition,
      { events, hidden },
      { context, complete: actual.status === "completed" },
    );
    scenario.expect.server = result.ok
      ? {
          ok: true,
          answers: byKey(result.submission.answers),
          context: result.submission.context,
          ...(result.submission.ignored.length ? { ignored: result.submission.ignored } : {}),
        }
      : { ok: false, errors: Object.keys(result.errors).map(keyOf) };
  }
  return scenario;
}
