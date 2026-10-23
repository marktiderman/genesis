import { calculator, isCalculated } from "./calculated";
import { isEmptyValue, normalizeValue } from "./fields";
import { coerceHidden } from "./hidden";
import { computePath, fieldMap, own, type EvalScope } from "./logic";
import { recall } from "./recall";
import type { Block, FieldBlock, FormDefinition, FormEvent, Json } from "./types";
import { validateField, type FieldValidator } from "./validate";

export interface FormState {
  /** Answers keyed by block id. */
  values: Record<string, Json | undefined>;
  /** URL and host inputs (untrusted) and server-resolved inputs, by name. */
  hidden: Record<string, Json | undefined>;
  /** Block ids the respondent steps through, given the answers so far. */
  path: string[];
  /** The block on screen in focus layout. */
  current: string | null;
  /** Visited blocks, for Back. */
  history: string[];
  errors: Record<string, string>;
  status: "in_progress" | "completed";
  /** The ending reached once completed. */
  ending: string | null;
  events: FormEvent[];
}

export interface CreateFormOptions {
  /** Prefilled answers by field id. Logged as leading `answer` events with `source: "prefill"`. */
  initialValues?: Record<string, Json> | undefined;
  /** Hidden inputs by name. Declared ones are typed with `coerceHidden`, as the server types them. */
  hidden?: Record<string, Json | undefined> | undefined;
  validators?: Record<string, FieldValidator> | undefined;
  /** Timestamps on events. Pass `() => undefined` to record none (anonymous forms). */
  clock?: (() => number | undefined) | undefined;
}

export interface FormEngine {
  readonly definition: FormDefinition;
  getState(): FormState;
  subscribe(listener: () => void): () => void;
  /** A field's id, from its key. */
  idOf(key: string): string;
  field(id: string): FieldBlock | undefined;
  block(id: string): Block | undefined;
  isVisible(id: string): boolean;
  /**
   * Set an answer. Like `next`, `back` and `submit`, it does nothing once the
   * response is completed: a completed response is final, so its stored
   * answers are the ones that were validated. It does nothing for a
   * `calculated` field either: the engine works that value out.
   */
  setValue(id: string, value: Json | undefined): void;
  /** Validate the current step and move on. Returns false if it has errors. */
  next(): boolean;
  back(): void;
  /** Validate every visible field and complete. Returns false if it has errors or is already completed. */
  submit(): boolean;
  /** Text with `{{recall}}` tokens resolved. */
  text(template: string): string;
  /** Visible, non-empty field values only, keyed by id: what a submit stores. */
  answers(): Record<string, Json>;
}

export function createForm(definition: FormDefinition, options: CreateFormOptions = {}): FormEngine {
  return build(definition, options).engine;
}

interface Built {
  engine: FormEngine;
  /** Apply a logged event as-is, appending to the log in place (replay only). */
  apply(event: FormEvent): void;
  /** End a replay: later events are copied and notify subscribers again. */
  finish(): void;
}

function build(definition: FormDefinition, options: CreateFormOptions, replaying = false): Built {
  const fields = fieldMap(definition);
  const byKey = new Map([...fields.values()].map((f) => [f.key, f]));
  const blocks = new Map(definition.blocks.map((b) => [b.id, b]));
  // An anonymous form records no timestamps, whatever clock is passed.
  const clock = definition.settings?.anonymous === true ? () => undefined : (options.clock ?? (() => Date.now()));
  const listeners = new Set<() => void>();
  // While replaying, events are pushed onto one array instead of copied per
  // event, so a long log replays in linear time.
  let batch = replaying;

  const scopeOf = (values: FormState["values"], hidden: FormState["hidden"]): EvalScope => ({
    values,
    hidden,
    fields,
  });

  // Declared inputs are typed exactly as the server types them; undeclared
  // names pass through (logic and recall cannot reference them).
  const declared = new Set((definition.hidden ?? []).map((h) => h.name));
  const initialHidden: FormState["hidden"] = {};
  for (const [name, value] of Object.entries(options.hidden ?? {})) {
    if (!declared.has(name)) initialHidden[name] = value;
  }
  Object.assign(initialHidden, coerceHidden(definition, options.hidden).values);

  // Calculated fields are worked out from the answers on the path, and logic
  // may read them, so the two settle together (a few rounds at most).
  const calc = calculator(definition);
  const settle = (values: FormState["values"], hidden: FormState["hidden"]) => {
    let { path } = computePath(definition, scopeOf(values, hidden));
    if (!calc.active) return { values, path };
    for (let round = 0; round < 4; round++) {
      const next = calc.withCalculated(values, path);
      if (next === values) break;
      values = next;
      path = computePath(definition, scopeOf(values, hidden)).path;
    }
    return { values, path };
  };

  const first = settle({}, initialHidden);
  let state: FormState = {
    values: first.values,
    hidden: initialHidden,
    path: first.path,
    current: first.path[0] ?? null,
    history: [],
    errors: {},
    status: "in_progress",
    ending: null,
    events: [],
  };

  const emit = (next: FormState) => {
    state = next;
    if (batch) return;
    for (const l of listeners) l();
  };
  const log = (event: FormEvent): FormEvent[] => {
    if (!batch) return [...state.events, event];
    state.events.push(event);
    return state.events;
  };
  const stamp = <E extends FormEvent>(event: E): E => {
    const at = clock();
    return at === undefined ? event : { ...event, at };
  };

  // Every block on the path is visible: the path only takes blocks whose
  // rules allow them, given the answers before them.
  const isVisibleIn = (s: FormState, id: string) => s.path.includes(id);

  const errorsFor = (s: FormState, ids: string[]) => {
    const errors: Record<string, string> = {};
    for (const id of ids) {
      const field = fields.get(id);
      if (!field || !isVisibleIn(s, id)) continue;
      const message = validateField(field, own(s.values, id), { custom: options.validators?.[id] });
      if (message) errors[id] = message;
    }
    return errors;
  };

  const answer = (id: string, value: Json | undefined, event: FormEvent) => {
    if (state.status === "completed" || own(state.values, id) === value || isCalculated(fields.get(id))) return;
    const { values, path } = settle({ ...state.values, [id]: value }, state.hidden);
    const errors = { ...state.errors };
    delete errors[id];
    emit({ ...state, values, path, errors, events: log(event) });
  };

  const engine: FormEngine = {
    definition,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    idOf(key) {
      const field = byKey.get(key);
      if (!field) throw new Error(`No field with key "${key}".`);
      return field.id;
    },
    field: (id) => fields.get(id),
    block: (id) => blocks.get(id),
    isVisible: (id) => isVisibleIn(state, id),

    setValue(id, value) {
      if (!fields.has(id)) throw new Error(`No field "${id}".`);
      answer(id, value, stamp({ type: "answer", field: id, value }));
    },

    next() {
      if (!state.current || state.status === "completed") return false;
      const errors = errorsFor(state, [state.current]);
      // A failed attempt is logged too, so a replay shows the same errors.
      const events = log(stamp({ type: "next" as const }));
      if (Object.keys(errors).length) {
        emit({ ...state, errors: { ...state.errors, ...errors }, events });
        return false;
      }
      const at = state.path.indexOf(state.current);
      const target = state.path[at + 1];
      if (!target) {
        emit({ ...state, events });
        return true;
      }
      emit({ ...state, current: target, history: [...state.history, state.current], events });
      return true;
    },

    back() {
      if (state.status === "completed") return;
      const history = [...state.history];
      let previous = history.pop();
      while (previous && !state.path.includes(previous)) previous = history.pop();
      if (!previous) return;
      emit({ ...state, current: previous, history, events: log(stamp({ type: "back" as const })) });
    },

    submit() {
      if (state.status === "completed") return false;
      const errors = errorsFor(state, state.path);
      const events = log(stamp({ type: "submit" as const }));
      if (Object.keys(errors).length) {
        const firstError = state.path.find((id) => own(errors, id)) ?? state.current;
        emit({ ...state, errors, current: firstError, events });
        return false;
      }
      const { ending } = computePath(definition, scopeOf(state.values, state.hidden));
      emit({ ...state, errors: {}, status: "completed", ending, events });
      return true;
    },

    text: (template) =>
      recall(template, { fieldsByKey: byKey, values: state.values, hidden: state.hidden }),

    answers() {
      const out: Record<string, Json> = {};
      for (const id of state.path) {
        const field = fields.get(id);
        const value = own(state.values, id);
        // An empty answer (`""`, blank text, `[]`) is stored as no answer.
        if (field && !isEmptyValue(value, field)) out[id] = normalizeValue(value as Json, field);
      }
      return out;
    },
  };

  // Prefilled answers are logged as leading `answer` events, so a replay of
  // the log, and the server, see them too.
  if (options.initialValues) {
    for (const [id, value] of Object.entries(options.initialValues)) {
      if (!fields.has(id) || value === undefined) continue;
      answer(id, value, stamp({ type: "answer", field: id, value, source: "prefill" }));
    }
  }

  const apply = (event: FormEvent) => {
    if (event.type === "answer") {
      if (fields.has(event.field)) {
        const { at: _at, ...logged } = event;
        answer(event.field, event.value, logged);
      }
    } else if (event.type === "next") engine.next();
    else if (event.type === "back") engine.back();
    else if (event.type === "submit") engine.submit();
    // Unknown event types are ignored.
  };
  const finish = () => {
    batch = false;
    state = { ...state, events: [...state.events] };
  };
  return { engine, apply, finish };
}

/** Rebuild a form's state from its event log. Timestamps are ignored. */
export function replay(
  definition: FormDefinition,
  events: FormEvent[],
  options: Omit<CreateFormOptions, "clock" | "initialValues"> = {},
): FormEngine {
  const { engine, apply, finish } = build(definition, { ...options, initialValues: undefined, clock: () => undefined }, true);
  for (const event of events) apply(event);
  finish();
  return engine;
}
