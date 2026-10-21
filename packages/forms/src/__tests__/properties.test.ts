import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { createForm, replay, validateField, type FormEngine, type Json } from "../index";
import { validateSubmission } from "../server";
import { afterClass } from "./sample-forms";

const def = afterClass.definition;
const hidden = { coach: "Sam", class: "6:00 AM" };
type Model = Record<string, never>;

/** Values a respondent (or a tampered client) could send: valid, invalid and empty. */
const valuesFor: Record<string, fc.Arbitrary<Json | undefined>> = {
  overall: fc.oneof(fc.integer({ min: 0, max: 7 }), fc.constantFrom<Json | undefined>(undefined, null, "5", 3.5)),
  went_well: fc.oneof(
    fc.subarray(["coaching", "workout", "community", "scaling", "equipment", "cleanliness"]),
    fc.constantFrom<Json | undefined>(undefined, ["bogus"], "coaching"),
  ),
  improve: fc.oneof(fc.string({ maxLength: 6 }), fc.constant(undefined)),
  contact_me: fc.constantFrom<Json | undefined>(true, false, undefined, "yes"),
  name: fc.oneof(fc.string({ maxLength: 6 }), fc.constant(undefined)),
  email: fc.oneof(
    fc.constantFrom<Json | undefined>("ada@example.com", "ada@", "", " ", undefined),
    fc.string({ maxLength: 8 }),
  ),
};

/** Invariants that hold after every step. */
function checkStep(engine: FormEngine) {
  for (const id of Object.keys(engine.answers())) {
    expect(engine.isVisible(id), `answers() holds hidden field ${id}`).toBe(true);
  }
}

class Answer implements fc.Command<Model, FormEngine> {
  constructor(
    readonly field: string,
    readonly value: Json | undefined,
  ) {}
  check = () => true;
  run(_m: Model, engine: FormEngine) {
    engine.setValue(this.field, this.value);
    checkStep(engine);
  }
  toString = () => `answer(${this.field}, ${JSON.stringify(this.value)})`;
}

class Step implements fc.Command<Model, FormEngine> {
  constructor(readonly action: "next" | "back" | "submit") {}
  check = () => true;
  run(_m: Model, engine: FormEngine) {
    engine[this.action]();
    checkStep(engine);
  }
  toString = () => this.action;
}

const commands = [
  ...Object.entries(valuesFor).map(([field, values]) => values.map((v) => new Answer(field, v))),
  fc.constant(new Step("next")),
  fc.constant(new Step("back")),
  fc.constant(new Step("submit")),
];

test.prop([fc.commands(commands, { maxCommands: 40 })], { numRuns: 200 })(
  "after-class: any sequence of answers and navigation keeps the engine, replay and server in agreement",
  (cmds) => {
    let engine!: FormEngine;
    fc.modelRun(() => {
      engine = createForm(def, { hidden, clock: () => undefined });
      return { model: {}, real: engine };
    }, cmds);

    const live = engine.getState();
    const again = replay(def, live.events, { hidden }).getState();
    expect(again.values).toEqual(live.values);
    expect(again.path).toEqual(live.path);
    expect(again.status).toEqual(live.status);
    expect(again.current).toEqual(live.current);
    expect(again.history).toEqual(live.history);
    expect(again.errors).toEqual(live.errors);
    expect(again.ending).toEqual(live.ending);

    if (live.status === "completed") {
      const result = validateSubmission(def, { events: live.events }, { context: hidden });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      expect(result.submission.answers).toEqual(engine.answers());
      expect(result.submission.ending).toEqual(live.ending);
      // A completed response stores only valid answers.
      for (const [id, value] of Object.entries(result.submission.answers)) {
        expect(validateField(engine.field(id)!, value), id).toBeNull();
      }
    }
  },
);
