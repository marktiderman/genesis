/** Walk a form the way a respondent would, by field key. */
import { createForm, type CreateFormOptions, type FormEngine } from "./engine";
import type { FormDefinition, Json } from "./types";

export { coverage, type CoverageOptions, type CoverageReport, type EndingCoverage } from "./coverage";
export {
  compactEvents,
  recordScenario,
  runScenario,
  type RecordScenarioOptions,
  type Scenario,
  type ScenarioExpectation,
  type ScenarioResult,
} from "./scenario";

export interface Simulation {
  engine: FormEngine;
  /** Answer by key: `answer({ overall: 2 })`. */
  answer(values: Record<string, Json | undefined>): Simulation;
  /** Keys of the fields currently visible, in path order. */
  visibleKeys(): string[];
  /** Keys on the respondent's path, fields and content. */
  pathKeys(): string[];
  /** Submit; returns the ending reached, or throws with the errors by key. */
  submit(): string | null;
}

export function simulate(
  form: FormDefinition | { definition: FormDefinition },
  options: CreateFormOptions = {},
): Simulation {
  const definition = "definition" in form ? form.definition : form;
  const engine = createForm(definition, { clock: () => undefined, ...options });
  const keyOf = (id: string) => engine.field(id)?.key ?? id;

  const sim: Simulation = {
    engine,
    answer(values) {
      for (const [key, value] of Object.entries(values)) engine.setValue(engine.idOf(key), value);
      return sim;
    },
    visibleKeys: () =>
      engine
        .getState()
        .path.filter((id) => engine.field(id) && engine.isVisible(id))
        .map(keyOf),
    pathKeys: () => engine.getState().path.map(keyOf),
    submit() {
      if (!engine.submit()) {
        const errors = Object.fromEntries(Object.entries(engine.getState().errors).map(([id, m]) => [keyOf(id), m]));
        throw new Error(`Form has errors: ${JSON.stringify(errors)}`);
      }
      return engine.getState().ending;
    },
  };
  return sim;
}
