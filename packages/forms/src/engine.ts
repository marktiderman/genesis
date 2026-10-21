import { computePath, fieldMap, ruleVisible, type EvalScope } from "./logic";
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
  initialValues?: Record<string, Json>;
  hidden?: Record<string, Json | undefined>;
  validators?: Record<string, FieldValidator>;
  /** Timestamps on events. Pass `() => undefined` to record none (anonymous forms). */
  clock?: () => number | undefined;
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
  setValue(id: string, value: Json | undefined): void;
  /** Validate the current step and move on. Returns false if it has errors. */
  next(): boolean;
  back(): void;
  /** Validate every visible field and complete. Returns false if it has errors. */
  submit(): boolean;
  /** Text with `{{recall}}` tokens resolved. */
  text(template: string): string;
  /** Visible field values only, keyed by id: what a submit stores. */
  answers(): Record<string, Json>;
}

export function createForm(definition: FormDefinition, options: CreateFormOptions = {}): FormEngine {
  const fields = fieldMap(definition);
  const byKey = new Map([...fields.values()].map((f) => [f.key, f]));
  const blocks = new Map(definition.blocks.map((b) => [b.id, b]));
  const clock = options.clock ?? (() => Date.now());
  const listeners = new Set<() => void>();

  const scopeOf = (values: FormState["values"], hidden: FormState["hidden"]): EvalScope => ({
    values,
    hidden,
    fields,
  });

  const initialValues: FormState["values"] = { ...(options.initialValues ?? {}) };
  const initialHidden = { ...(options.hidden ?? {}) };
  const first = computePath(definition, scopeOf(initialValues, initialHidden));

  let state: FormState = {
    values: initialValues,
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
    for (const l of listeners) l();
  };
  const stamp = <E extends FormEvent>(event: E): E => {
    const at = clock();
    return at === undefined ? event : { ...event, at };
  };

  const isVisibleIn = (s: FormState, id: string) =>
    s.path.includes(id) && ruleVisible(definition, id, scopeOf(s.values, s.hidden));

  const errorsFor = (s: FormState, ids: string[]) => {
    const errors: Record<string, string> = {};
    for (const id of ids) {
      const field = fields.get(id);
      if (!field || !isVisibleIn(s, id)) continue;
      const message = validateField(field, s.values[id], { custom: options.validators?.[id] });
      if (message) errors[id] = message;
    }
    return errors;
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
      if (state.values[id] === value) return;
      const values = { ...state.values, [id]: value };
      const { path } = computePath(definition, scopeOf(values, state.hidden));
      const { [id]: _cleared, ...errors } = state.errors;
      emit({
        ...state,
        values,
        path,
        errors,
        events: [...state.events, stamp({ type: "answer", field: id, value })],
      });
    },

    next() {
      if (!state.current) return false;
      const errors = errorsFor(state, [state.current]);
      if (Object.keys(errors).length) {
        emit({ ...state, errors: { ...state.errors, ...errors } });
        return false;
      }
      const at = state.path.indexOf(state.current);
      const target = state.path[at + 1];
      const events = [...state.events, stamp({ type: "next" as const })];
      if (!target) {
        emit({ ...state, events });
        return true;
      }
      emit({ ...state, current: target, history: [...state.history, state.current], events });
      return true;
    },

    back() {
      const history = [...state.history];
      let previous = history.pop();
      while (previous && !state.path.includes(previous)) previous = history.pop();
      if (!previous) return;
      emit({ ...state, current: previous, history, events: [...state.events, stamp({ type: "back" as const })] });
    },

    submit() {
      const errors = errorsFor(state, state.path);
      if (Object.keys(errors).length) {
        const firstError = state.path.find((id) => errors[id]) ?? state.current;
        emit({ ...state, errors, current: firstError });
        return false;
      }
      const { ending } = computePath(definition, scopeOf(state.values, state.hidden));
      emit({
        ...state,
        errors: {},
        status: "completed",
        ending,
        events: [...state.events, stamp({ type: "submit" as const })],
      });
      return true;
    },

    text: (template) =>
      recall(template, { fieldsByKey: byKey, values: state.values, hidden: state.hidden }),

    answers() {
      const out: Record<string, Json> = {};
      for (const id of state.path) {
        const value = state.values[id];
        if (fields.has(id) && value !== undefined && isVisibleIn(state, id)) out[id] = value;
      }
      return out;
    },
  };
  return engine;
}

/** Rebuild a form's state from its event log. Timestamps are ignored. */
export function replay(
  definition: FormDefinition,
  events: FormEvent[],
  options: Omit<CreateFormOptions, "clock" | "initialValues"> = {},
): FormEngine {
  const engine = createForm(definition, { ...options, clock: () => undefined });
  for (const event of events) {
    if (event.type === "answer") {
      if (engine.field(event.field)) engine.setValue(event.field, event.value);
    } else if (event.type === "next") engine.next();
    else if (event.type === "back") engine.back();
    else if (event.type === "submit") engine.submit();
    // Unknown event types are ignored.
  }
  return engine;
}

