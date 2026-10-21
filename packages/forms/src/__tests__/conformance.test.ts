import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createForm, replay } from "../index";
import { compactEvents, recordScenario, runScenario, type Scenario } from "../testing";
import { afterClass, monthlyPulse } from "./sample-forms";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "conformance");
const files = readdirSync(dir).filter((f) => f.endsWith(".scenario.json")).sort();
const load = (file: string) => JSON.parse(readFileSync(join(dir, file), "utf8")) as Scenario;
const definitions = { [afterClass.definition.id]: afterClass.definition, [monthlyPulse.definition.id]: monthlyPulse.definition };

/** Drive the engine through its public API, the way a renderer does. */
function liveRun(s: Scenario) {
  const engine = createForm(s.definition, {
    hidden: { ...(s.hidden ?? {}), ...(s.context ?? {}) },
    clock: () => undefined,
  });
  for (const e of s.events) {
    if (e.type === "answer") {
      if (engine.field(e.field)) engine.setValue(e.field, e.value);
    } else if (e.type === "next") engine.next();
    else if (e.type === "back") engine.back();
    else engine.submit();
  }
  return engine;
}

describe("conformance fixtures", () => {
  it("has the R1 suite", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  describe.each(files)("%s", (file) => {
    const scenario = load(file);

    it("passes runScenario", () => {
      const result = runScenario(scenario);
      expect(result.failures).toEqual([]);
      expect(result.pass).toBe(true);
    });

    it("is versioned and uses the canonical sample definition", () => {
      expect(scenario.scenarioVersion).toBe(1);
      expect(scenario.definition).toEqual(definitions[scenario.definition.id]);
    });

    it("replays to the same state as a live run", () => {
      const live = liveRun(scenario).getState();
      const replayed = replay(scenario.definition, scenario.events, {
        hidden: { ...(scenario.hidden ?? {}), ...(scenario.context ?? {}) },
      }).getState();
      const { events: _a, ...l } = live;
      const { events: _b, ...r } = replayed;
      expect(r).toEqual(l);
      expect(replayed.events).toEqual(live.events);
    });
  });
});

describe("runScenario", () => {
  it("reports each mismatch", () => {
    const scenario = load(files.find((f) => f.includes("happy-path"))!);
    const broken: Scenario = {
      ...scenario,
      expect: { ...scenario.expect, ending: "nope", answers: {}, server: { ok: false, errors: ["overall"] } },
    };
    const result = runScenario(broken);
    expect(result.pass).toBe(false);
    expect(result.failures.map((f) => f.split(":")[0])).toEqual(["ending", "answers", "server.ok"]);
  });

  it("rejects an unknown scenario version", () => {
    const scenario = load(files[0]!);
    const result = runScenario({ ...scenario, scenarioVersion: 2 as 1 });
    expect(result.pass).toBe(false);
  });
});

describe("recordScenario and compactEvents", () => {
  it("records a live engine as a scenario that passes", () => {
    const engine = createForm(afterClass.definition, { hidden: { coach: "Sam" } });
    engine.setValue("overall", 4);
    for (const text of ["G", "Gr", "Gre", "Great"]) engine.setValue("improve", text);
    engine.setValue("contact_me", false);
    engine.submit();
    const scenario = recordScenario(engine, "recorded");
    expect(scenario.context).toEqual({ coach: "Sam" });
    expect(scenario.events).toEqual([
      { type: "answer", field: "overall", value: 4 },
      { type: "answer", field: "improve", value: "Great" },
      { type: "answer", field: "contact_me", value: false },
      { type: "submit" },
    ]);
    expect(scenario.expect.server).toMatchObject({ ok: true });
    expect(runScenario(JSON.parse(JSON.stringify(scenario)) as Scenario).pass).toBe(true);
  });

  it("merges only consecutive answers to the same field", () => {
    expect(
      compactEvents([
        { type: "answer", field: "a", value: "x" },
        { type: "answer", field: "a", value: "xy" },
        { type: "answer", field: "b", value: 1 },
        { type: "answer", field: "a", value: "xyz" },
        { type: "next" },
        { type: "answer", field: "a", value: "w" },
      ]),
    ).toEqual([
      { type: "answer", field: "a", value: "xy" },
      { type: "answer", field: "b", value: 1 },
      { type: "answer", field: "a", value: "xyz" },
      { type: "next" },
      { type: "answer", field: "a", value: "w" },
    ]);
  });
});
