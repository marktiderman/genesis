import {
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  answersOnPath,
  createForm,
  optionFilter,
  respondentPath,
  visibleOptions,
  type Block,
  type ChoiceOption,
  type CreateFormOptions,
  type FieldBlock,
  type FormDefinition,
  type FormEngine,
  type FormState,
  type Json,
} from "@marktiderman/genesis-forms";

type FormLike = FormDefinition | { definition: FormDefinition };
const definitionOf = (form: FormLike) => ("definition" in form ? form.definition : form);

// ── Engine hooks ─────────────────────────────────────────────────────────────

/**
 * Create a form engine for a definition. The engine lives as long as the
 * definition's identity: pass a different definition object and you get a
 * fresh engine (and a fresh response). Keep the definition stable (module
 * scope, `useMemo`) so a re-render doesn't start over. `options` are read when
 * an engine is created.
 */
export function useForm(form: FormLike, options?: CreateFormOptions | undefined): FormEngine {
  const definition = definitionOf(form);
  // Held in state, not a ref: a discarded render's new engine is thrown away
  // with it instead of leaking into the next render.
  const [held, setHeld] = useState(() => ({ definition, engine: createForm(definition, options) }));
  if (held.definition !== definition) {
    const next = { definition, engine: createForm(definition, options) };
    setHeld(next);
    return next.engine;
  }
  return held.engine;
}

/**
 * Subscribe to one slice of the form state. The component re-renders only
 * when the selected value changes (`Object.is`), so return primitives or
 * references the engine keeps stable (a field's value, an error string).
 */
export function useFormSelector<T>(engine: FormEngine, select: (state: FormState) => T): T {
  return useSyncExternalStore(
    engine.subscribe,
    () => select(engine.getState()),
    () => select(engine.getState()),
  );
}

export interface FieldBinding {
  field: FieldBlock;
  value: Json | undefined;
  error: string | undefined;
  visible: boolean;
  setValue(value: Json | undefined): void;
  /** The label with `{{recall}}` resolved. */
  label: string;
}

/** Everything one field renderer needs. Typing in one field re-renders that field only. */
export function useField(engine: FormEngine, id: string): FieldBinding {
  const field = engine.field(id);
  if (!field) throw new Error(`useField: no field "${id}".`);
  const value = useFormSelector(engine, (s) => s.values[id]);
  const error = useFormSelector(engine, (s) => s.errors[id]);
  const visible = useFormSelector(engine, () => engine.isVisible(id));
  // Recall can depend on any answer or hidden input; re-resolve only when the text changes.
  const label = useFormSelector(engine, () => engine.text(field.label));
  return useMemo(
    () => ({ field, value, error, visible, label, setValue: (v) => engine.setValue(id, v) }),
    [engine, field, id, value, error, visible, label],
  );
}

/**
 * The options a choice question shows now (`visibleOptions` over `answersOnPath`): all of them,
 * or, when its list is filtered by another answer (`props.optionsFrom.filter`), the ones matching
 * that answer. It
 * re-renders only when that list changes, so a renderer on any platform shows exactly what the
 * engine accepts.
 */
export function useChoiceOptions(engine: FormEngine, id: string): ChoiceOption[] {
  const field = engine.field(id);
  if (!field) throw new Error(`useChoiceOptions: no field "${id}".`);
  const filtered = optionFilter(field) !== undefined;
  // The shown values as one string: stable while the list is the same.
  const key = useFormSelector(engine, (s) =>
    filtered ? visibleOptions(engine.definition, field, answersOnPath(s)).map((o) => o.value).join("\u0000") : "",
  );
  return useMemo(() => {
    if (!filtered) return visibleOptions(engine.definition, field, {});
    const shown = new Set(key ? key.split("\u0000") : []);
    return visibleOptions(engine.definition, field, {}).filter((o) => shown.has(o.value));
  }, [engine, field, filtered, key]);
}

/**
 * The blocks the respondent steps through (`respondentPath`): the path without questions a
 * prefill answered and hides (`props.prefill.hideWhenPrefilled`). Render these, not
 * `state.path`, so a hidden question is neither shown nor counted.
 */
export function useRespondentPath(engine: FormEngine): string[] {
  const key = useFormSelector(engine, (s) => respondentPath(engine.definition, s).join("\u0000"));
  return useMemo(() => (key ? key.split("\u0000") : []), [key]);
}

// ── Renderer registry ────────────────────────────────────────────────────────

export interface FieldRendererProps {
  engine: FormEngine;
  binding: FieldBinding;
  /**
   * Element id for the control (and `${inputId}-error`, `${inputId}-desc`,
   * `${inputId}-label`). Unique per `<FormRuntime>`, so two forms on one page
   * never share ids.
   */
  inputId: string;
  /**
   * Ask the layout to advance (focus layout, auto-advance on). Call it only
   * for a deliberate pick (a click or tap, Space or Enter), never for a change
   * that arrow keys made while moving through a group. The layout ignores it
   * on the last question, so a pick never submits.
   */
  onAdvance?: (() => void) | undefined;
}

export interface RendererEntry {
  /** Match by field type… */
  type?: string | undefined;
  /** …or by any test on the block. */
  test?: ((block: FieldBlock) => boolean) | undefined;
  /** Highest rank wins. Built-ins use 1; override with a higher rank. */
  rank?: number | undefined;
  Component: ComponentType<FieldRendererProps>;
}

export interface RendererRegistry {
  register(entry: RendererEntry): RendererRegistry;
  resolve(block: FieldBlock): ComponentType<FieldRendererProps> | undefined;
  /** A new registry with these entries plus this one's. */
  extend(entries: RendererEntry[]): RendererRegistry;
}

export function createRendererRegistry(entries: RendererEntry[] = []): RendererRegistry {
  const list = [...entries];
  const registry: RendererRegistry = {
    register(entry) {
      list.push(entry);
      return registry;
    },
    resolve(block) {
      let best: RendererEntry | undefined;
      for (const entry of list) {
        const matches = entry.test ? entry.test(block) : entry.type === block.type;
        if (matches && (!best || (entry.rank ?? 1) >= (best.rank ?? 1))) best = entry;
      }
      return best?.Component;
    },
    extend: (more) => createRendererRegistry([...list, ...more]),
  };
  return registry;
}

// ── Runtime ──────────────────────────────────────────────────────────────────

interface FormContextValue {
  engine: FormEngine;
  registry: RendererRegistry;
  /** Prefix for every element id this form renders (from `useId`). */
  idPrefix: string;
}

const FormContext = createContext<FormContextValue | null>(null);

export function useFormContext(): FormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("useFormContext: wrap the form in <FormRuntime>.");
  return ctx;
}

export interface FormRuntimeProps {
  engine: FormEngine;
  registry: RendererRegistry;
  children: ReactNode;
}

/** Headless: provides the engine, the renderer registry and an id prefix to everything below. */
export function FormRuntime({ engine, registry, children }: FormRuntimeProps) {
  // `useId` keeps ids unique when two forms share a page; only letters and
  // digits are kept so an id is safe in a URL fragment and a CSS selector.
  const idPrefix = `gf-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const value = useMemo(() => ({ engine, registry, idPrefix }), [engine, registry, idPrefix]);
  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
}

/** Render one block with whatever the registry resolves. */
export function FieldRenderer({
  id,
  ...rest
}: { id: string } & Omit<FieldRendererProps, "engine" | "binding" | "inputId">) {
  const { engine, registry, idPrefix } = useFormContext();
  const binding = useField(engine, id);
  const Component = registry.resolve(binding.field);
  if (!Component) throw new Error(`No renderer registered for field type "${binding.field.type}".`);
  return <Component engine={engine} binding={binding} inputId={`${idPrefix}-${id}`} {...rest} />;
}

export type { Block, ChoiceOption, FieldBlock, FormEngine, FormState, Json };
