import { useState, useSyncExternalStore } from "react";
import { createForm, type CreateFormOptions, type FormDefinition, type FormEngine, type FormState } from "@marktiderman/genesis-forms";

export type FormLike = FormDefinition | { definition: FormDefinition };
const definitionOf = (form: FormLike) => ("definition" in form ? form.definition : form);

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
