// @feat:option-lists
import { describe, expect, it } from "vitest";
import {
  answerSnapshots,
  answersFromSnapshots,
  choiceOptions,
  clearFilteredAnswers,
  createForm,
  defineForm,
  f,
  hiddenByPrefill,
  isHttpsUrl,
  isSearchable,
  parseForm,
  prefillFromLink,
  readOption,
  replay,
  respondentPath,
  searchOptions,
  SEARCHABLE_OPTION_COUNT,
  visibleOptions,
  withHostOptions,
  type FieldBlock,
  type FormDefinition,
  type HostOptions,
} from "../index";
import { validateSubmission } from "../server";

const lists: HostOptions = {
  locations: [
    { value: "cff", label: "CrossFit Fairfield", description: "12 Main St", image: "https://example.com/cff.png" },
    { value: "cornerstone", label: "Cornerstone Fitness" },
  ],
  coaches: [
    { value: "ada", label: "Ada", attributes: { location: "cff" } },
    { value: "sam", label: "Sam", attributes: { location: ["cff", "cornerstone"] } },
    { value: "zoe", label: "Zoë", attributes: { location: "cornerstone" } },
  ],
};

const form = defineForm({
  id: "visit",
  title: "Your visit",
  blocks: [
    f.dropdown("location", {
      label: "Where?",
      required: true,
      optionsFrom: { source: "host", key: "locations" },
      prefill: { param: "location", hideWhenPrefilled: true },
    }),
    f.singleChoice("coach", {
      label: "Who coached you?",
      optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } },
      prefill: { param: "coach" },
    }),
    f.multiChoice("helpers", {
      label: "Who else helped?",
      optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "location" } },
      prefill: { param: "helper" },
      other: true,
    }),
    f.shortText("note", { label: "Anything else?" }),
  ],
});
const def = form.definition;
const filled = withHostOptions(def, lists);
const fieldOf = (d: FormDefinition, key: string) =>
  d.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === key)!;
const values = (o: { label?: string; value: string }[]) => o.map((x) => x.value);

describe("richer options", () => {
  it("keeps description, image and attributes, and drops malformed ones", () => {
    expect(readOption({ value: "a", label: "A", description: "Line", image: "https://x.test/a.png", attributes: { k: ["1", "2"] } })).toEqual({
      value: "a",
      label: "A",
      description: "Line",
      image: "https://x.test/a.png",
      attributes: { k: ["1", "2"] },
    });
    expect(
      readOption({ value: "a", description: "x".repeat(501), image: "http://x.test/a.png", attributes: { ok: "1", bad: 3, constructor: "x" } }),
    ).toEqual({ value: "a", attributes: { ok: "1" } });
    expect(readOption({ label: "no value" })).toBeNull();
  });

  it("accepts only https image links", () => {
    expect(isHttpsUrl("https://cdn.example.com/a.png?w=40")).toBe(true);
    for (const bad of ["http://x.test/a.png", "javascript:alert(1)", "https://", "https://a b.png", "https://user@x.test/", "data:image/png;base64,AA"]) {
      expect(isHttpsUrl(bad)).toBe(false);
    }
  });

  it("withHostOptions fills in the details, and choiceOptions reads them", () => {
    expect(choiceOptions(fieldOf(filled, "location"))[0]).toEqual(lists.locations![0]);
    expect(choiceOptions(fieldOf(filled, "coach"))[1]!.attributes).toEqual({ location: ["cff", "cornerstone"] });
  });

  it("parseForm checks option details, the filter and the prefill", () => {
    expect(parseForm(def).ok).toBe(true);
    const bad = structuredClone(def);
    fieldOf(bad, "location").props = {
      ...fieldOf(bad, "location").props,
      options: [{ value: "x", image: "http://insecure.test/x.png", description: 5, attributes: { a: 1 } }],
      prefill: { param: "has space" },
      searchable: "yes",
    };
    // A filter must read an earlier question.
    fieldOf(bad, "coach").props = { optionsFrom: { source: "host", key: "coaches", filter: { attribute: "location", field: "note" } } };
    const parsed = parseForm(bad);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const paths = parsed.issues.map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "blocks[0].props.options[0].image",
        "blocks[0].props.options[0].description",
        "blocks[0].props.options[0].attributes.a",
        "blocks[0].props.prefill",
        "blocks[0].props.searchable",
        "blocks[1].props.optionsFrom.filter.field",
      ]),
    );
  });

  it("the f helpers store options with details, the filter, prefill and searchable", () => {
    const d = defineForm({
      id: "x",
      title: "X",
      blocks: [
        f.singleChoice("pick", {
          label: "Pick",
          options: [{ value: "a", label: "A", description: "First", attributes: { tag: "t" } }],
          searchable: true,
        }),
      ],
    }).definition;
    expect(fieldOf(d, "pick").props).toEqual({
      options: [{ value: "a", label: "A", description: "First", attributes: { tag: "t" } }],
      searchable: true,
    });
    expect(fieldOf(def, "coach").props?.prefill).toEqual({ param: "coach" });
  });
});

describe("lists filtered by another answer", () => {
  it("shows every option until the other question is answered, then the matching ones", () => {
    const coach = fieldOf(filled, "coach");
    expect(values(visibleOptions(filled, coach, {}))).toEqual(["ada", "sam", "zoe"]);
    expect(values(visibleOptions(filled, coach, { location: "cff" }))).toEqual(["ada", "sam"]);
    expect(values(visibleOptions(filled, coach, { location: "cornerstone" }))).toEqual(["sam", "zoe"]);
  });

  it("clears a pick the new answer no longer shows, and keeps one it still shows", () => {
    const engine = createForm(def, { hostOptions: lists });
    const id = (k: string) => engine.idOf(k);
    engine.setValue(id("location"), "cff");
    engine.setValue(id("coach"), "ada");
    engine.setValue(id("helpers"), ["ada", "sam", "my cousin"]);
    engine.setValue(id("location"), "cornerstone");
    const s = engine.getState();
    expect(s.values[id("coach")]).toBeUndefined();
    // Sam works at both; a typed "Other" answer isn't an option, so it stays.
    expect(s.values[id("helpers")]).toEqual(["sam", "my cousin"]);
  });

  it("clearFilteredAnswers returns the same object when nothing changes", () => {
    const v = { location: "cff", coach: "sam" };
    expect(clearFilteredAnswers(filled, v, "location")).toBe(v);
    expect(clearFilteredAnswers(filled, { location: "cornerstone", coach: "ada" }, "location")).toEqual({ location: "cornerstone", coach: undefined });
  });

  it("refuses a pick outside the filtered list in the engine and on the server", () => {
    const engine = createForm(def, { hostOptions: lists, initialValues: { location: "cornerstone", coach: "ada" } });
    expect(engine.submit()).toBe(false);
    expect(engine.getState().errors.coach).toBe("Choose one of the options.");

    const answers = { location: "cornerstone", coach: "ada" };
    const result = validateSubmission(def, { answers }, { hostOptions: lists });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.coach).toBe("Choose one of the options.");
    const draft = validateSubmission(def, { answers }, { hostOptions: lists, complete: false });
    expect(draft.ok).toBe(false);
    expect(validateSubmission(def, { answers: { location: "cornerstone", coach: "zoe" } }, { hostOptions: lists }).ok).toBe(true);
  });

  it("replays to the same cleared answers", () => {
    const engine = createForm(def, { hostOptions: lists });
    engine.setValue("location", "cff");
    engine.setValue("coach", "ada");
    engine.setValue("location", "cornerstone");
    engine.setValue("coach", "zoe");
    expect(engine.submit()).toBe(true);
    const again = replay(def, engine.getState().events, { hostOptions: lists });
    expect(again.answers()).toEqual(engine.answers());
    expect(validateSubmission(def, { events: engine.getState().events }, { hostOptions: lists }).ok).toBe(true);
  });
});

describe("search for long lists", () => {
  it("is on above the threshold, and props.searchable overrides it", () => {
    const field = fieldOf(def, "coach");
    expect(isSearchable(field, SEARCHABLE_OPTION_COUNT)).toBe(false);
    expect(isSearchable(field, SEARCHABLE_OPTION_COUNT + 1)).toBe(true);
    expect(isSearchable({ ...field, props: { searchable: true } }, 2)).toBe(true);
    expect(isSearchable({ ...field, props: { searchable: false } }, 50)).toBe(false);
  });

  it("matches every word in the label, value or description, ignoring case and accents", () => {
    const options = choiceOptions(fieldOf(filled, "location"));
    expect(values(searchOptions(options, "main"))).toEqual(["cff"]);
    expect(values(searchOptions(options, "FITNESS corner"))).toEqual(["cornerstone"]);
    expect(values(searchOptions(choiceOptions(fieldOf(filled, "coach")), "zoe"))).toEqual(["zoe"]);
    expect(searchOptions(options, "  ")).toHaveLength(2);
  });
});

describe("preselect from a link", () => {
  it("takes a parameter that is one of the options and ignores anything else", () => {
    expect(prefillFromLink(filled, new URLSearchParams("location=cornerstone&coach=ada&helper=sam,zoe,nobody"))).toEqual({
      location: "cornerstone",
      // Ada isn't at Cornerstone: the filtered list is respected.
      helpers: ["sam", "zoe"],
    });
    expect(prefillFromLink(filled, { location: "nowhere", helper: ["ada", "ada"] })).toEqual({ helpers: ["ada"] });
    expect(prefillFromLink(filled, { location: "cff" }, { location: "cornerstone" })).toEqual({});
  });

  it("prefills through createForm, with initialValues winning, and the server checks it", () => {
    const engine = createForm(def, { hostOptions: lists, linkParams: { location: "cff", coach: "ada" }, initialValues: { coach: "sam" } });
    expect(engine.answers()).toEqual({ location: "cff", coach: "sam" });
    expect(engine.getState().events[0]).toMatchObject({ type: "answer", source: "prefill" });
    expect(engine.submit()).toBe(true);
    // A crafted value the list doesn't have is refused on the server like any answer.
    const forged = validateSubmission(def, { answers: { location: "made-up" } }, { hostOptions: lists });
    expect(forged.ok).toBe(false);
  });

  it("hides a question the link filled in, steps over it, and stores its answer", () => {
    const engine = createForm(def, { hostOptions: lists, linkParams: { location: "cff" } });
    const s = engine.getState();
    expect(hiddenByPrefill(engine.definition, s)).toEqual(["location"]);
    expect(respondentPath(engine.definition, s)).toEqual(["coach", "helpers", "note"]);
    expect(s.current).toBe("coach");
    engine.setValue("coach", "ada");
    expect(engine.next()).toBe(true);
    expect(engine.getState().current).toBe("helpers");
    engine.back();
    expect(engine.getState().current).toBe("coach");
    // Back from the first question shown goes nowhere: the hidden one is skipped.
    engine.back();
    expect(engine.getState().current).toBe("coach");
    expect(engine.submit()).toBe(true);
    expect(engine.answers()).toMatchObject({ location: "cff", coach: "ada" });

    const again = replay(def, engine.getState().events, { hostOptions: lists });
    expect(again.getState().current).toBe(engine.getState().current);
    expect(validateSubmission(def, { events: engine.getState().events }, { hostOptions: lists })).toMatchObject({ ok: true });
  });

  it("shows the question again once the respondent's own answer replaces the prefill", () => {
    const engine = createForm(def, { hostOptions: lists, linkParams: { location: "cff" } });
    engine.setValue("location", "cornerstone");
    expect(hiddenByPrefill(engine.definition, engine.getState())).toEqual([]);
  });
});

describe("answer snapshots", () => {
  it("pairs each host-option answer with its label now", () => {
    const snaps = answerSnapshots(filled, { location: "cff", coach: "sam", helpers: ["zoe", "my cousin"], note: "hi" });
    expect(snaps).toEqual({
      location: { value: "cff", label: "CrossFit Fairfield" },
      coach: { value: "sam", label: "Sam" },
      helpers: [
        { value: "zoe", label: "Zoë" },
        { value: "my cousin", label: "my cousin", other: true },
      ],
    });
  });

  it("finds the value again for an edit link: by value, then by label, else missing", () => {
    const renamed = withHostOptions(def, {
      ...lists,
      locations: [{ value: "cff-2", label: "crossfit fairfield" }],
    });
    const restored = answersFromSnapshots(renamed, {
      location: { value: "cff", label: "CrossFit Fairfield" },
      coach: { value: "gone", label: "Nobody now" },
      helpers: [
        { value: "sam", label: "Sam (old name)" },
        { value: "my cousin", label: "my cousin", other: true },
      ],
    });
    expect(restored.answers).toEqual({ location: "cff-2", helpers: ["sam", "my cousin"] });
    expect(restored.missing).toEqual({ coach: [{ value: "gone", label: "Nobody now" }] });
  });
});
