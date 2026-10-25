// @feat:forms-native
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineForm, f, OTHER_MAX_LENGTH } from "@marktiderman/genesis-forms";
import { ADVANCE_DELAY_MS } from "@marktiderman/genesis-forms-react";
import { act, byTestId, next, press, queryTestId, renderForm, screen, type } from "./helpers";

afterEach(() => vi.useRealTimers());

const coaches = [
  { value: "ada", label: "Ada", attributes: { gym: "riverside" } },
  { value: "grace", label: "Grace", attributes: { gym: ["riverside", "hilltop"] } },
  { value: "alan", label: "Alan", attributes: { gym: "hilltop" } },
];

const filtered = defineForm({
  id: "filtered",
  title: "Filtered",
  layout: { mode: "focus" },
  blocks: [
    f.singleChoice("gym", { label: "Gym", options: [{ value: "riverside", label: "Riverside Gym" }, { value: "hilltop", label: "Hilltop Gym" }] }),
    f.singleChoice("coach", { label: "Coach", required: true, optionsFrom: { source: "host", key: "coaches", filter: { attribute: "gym", field: "gym" } } }),
    f.shortText("notes", { label: "Notes" }),
  ],
});

const many = Array.from({ length: 14 }, (_, i) => ({ value: `c${i}`, label: i === 3 ? "Zoë Park" : `Class ${i}` }));
const long = defineForm({
  id: "long",
  title: "Long",
  layout: { mode: "focus" },
  blocks: [
    f.singleChoice("class", { label: "Which class?", options: many, other: { label: "Something else" } }),
    f.multiChoice("extras", { label: "Extras", options: many }),
    f.shortText("end", { label: "End" }),
  ],
});

describe("filtered lists", () => {
  it("show only the options matching the earlier answer", () => {
    const { engine } = renderForm(filtered, { autoAdvance: false }, { hostOptions: { coaches } });
    press("form-gym-option-hilltop");
    next();
    expect(queryTestId("form-coach-option-alan")).not.toBeNull();
    expect(queryTestId("form-coach-option-grace")).not.toBeNull();
    expect(queryTestId("form-coach-option-ada")).toBeNull();
    press("form-coach-option-alan");
    expect(engine.getState().values[engine.idOf("coach")]).toBe("alan");
  });

  it("with no matching option, say so rather than show an empty group", () => {
    const def = defineForm({
      id: "none",
      title: "None",
      layout: { mode: "focus" },
      blocks: [
        f.singleChoice("gym", { label: "Gym", options: [{ value: "harbour" }] }),
        f.singleChoice("coach", { label: "Coach", optionsFrom: { source: "host", key: "coaches", filter: { attribute: "gym", field: "gym" } } }),
      ],
    });
    renderForm(def, { autoAdvance: false }, { hostOptions: { coaches } });
    press("form-gym-option-harbour");
    next();
    screen.getByText("No options to choose from.");
  });
});

describe("searchable lists", () => {
  it("get a search box over more than ten options, matching without accents", () => {
    renderForm(long, { autoAdvance: false });
    const search = byTestId("form-class-search");
    expect(search.getAttribute("role")).toBe("search");
    expect(search.getAttribute("aria-label")).toBe("Search: Which class?");
    type("form-class-search", "zoe");
    expect(queryTestId("form-class-option-c3")).not.toBeNull();
    expect(queryTestId("form-class-option-c1")).toBeNull();
    // "Other" stays reachable while searching.
    expect(queryTestId("form-class-option-other")).not.toBeNull();
    press("form-class-option-c3");
    screen.getByText("Your choice: Zoë Park");
  });

  it("say when nothing matches", () => {
    renderForm(long, { autoAdvance: false });
    type("form-class-search", "pottery");
    screen.getByText("No matches.");
  });

  it("decide from all the options, so a filter that narrows the list keeps the search box", () => {
    const hostCoaches = Array.from({ length: 12 }, (_, i) => ({ value: `k${i}`, attributes: { gym: i === 0 ? "harbour" : "riverside" } }));
    const def = defineForm({
      id: "narrow",
      title: "Narrow",
      layout: { mode: "focus" },
      blocks: [
        f.singleChoice("gym", { label: "Gym", options: [{ value: "harbour" }, { value: "riverside" }] }),
        f.singleChoice("coach", { label: "Coach", optionsFrom: { source: "host", key: "coaches", filter: { attribute: "gym", field: "gym" } } }),
      ],
    });
    renderForm(def, { autoAdvance: false }, { hostOptions: { coaches: hostCoaches } });
    press("form-gym-option-harbour");
    next();
    expect(queryTestId("form-coach-search")).not.toBeNull();
    expect(queryTestId("form-coach-option-k0")).not.toBeNull();
    expect(queryTestId("form-coach-option-k1")).toBeNull();
  });
});

describe("Other", () => {
  it("takes the respondent's own words as the answer, capped, and doesn't move on", () => {
    vi.useFakeTimers();
    const { engine } = renderForm(long);
    const id = engine.idOf("class");
    press("form-class-option-other");
    const box = byTestId("form-class-other-text") as HTMLInputElement;
    expect(box.maxLength).toBe(OTHER_MAX_LENGTH);
    expect(box.getAttribute("aria-label")).toBe("Something else: your answer");
    expect(engine.getState().values[id]).toBeUndefined();
    type("form-class-other-text", "Aerial yoga");
    act(() => vi.advanceTimersByTime(ADVANCE_DELAY_MS * 2));
    expect(engine.getState().current).toBe(id);
    expect(engine.getState().values[id]).toBe("Aerial yoga");
    // Picking an option drops the typed answer; picking Other again brings it back.
    press("form-class-option-c1");
    expect(engine.getState().values[id]).toBe("c1");
    press("form-class-option-other");
    expect(engine.getState().values[id]).toBe("Aerial yoga");
  });

  it("is one more item of a multiple choice while it is ticked and not blank", () => {
    const def = defineForm({
      id: "m",
      title: "M",
      layout: { mode: "focus" },
      blocks: [f.multiChoice("goals", { label: "Goals", options: [{ value: "strength" }], other: true }), f.shortText("x", { label: "X" })],
    });
    const { engine } = renderForm(def);
    const id = engine.idOf("goals");
    press("form-goals-option-strength");
    press("form-goals-option-other");
    type("form-goals-other-text", "Mobility");
    expect(engine.getState().values[id]).toEqual(["strength", "Mobility"]);
    type("form-goals-other-text", "  ");
    expect(engine.getState().values[id]).toEqual(["strength"]);
    type("form-goals-other-text", "Mobility");
    press("form-goals-option-other");
    expect(engine.getState().values[id]).toEqual(["strength"]);
  });

  it("comes back with its text after Back", () => {
    const { engine } = renderForm(long, { autoAdvance: false });
    press("form-class-option-other");
    type("form-class-other-text", "Aerial yoga");
    next();
    expect(engine.getState().current).toBe(engine.idOf("extras"));
    act(() => {
      byTestId("form-back").click();
    });
    expect((byTestId("form-class-other-text") as HTMLInputElement).value).toBe("Aerial yoga");
    expect(byTestId("form-class-option-other").getAttribute("aria-checked")).toBe("true");
  });
});
