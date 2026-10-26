// @feat:forms-studio
import { describe, expect, it } from "vitest";
import type { FieldBlock, FormDefinition, Json } from "@marktiderman/genesis-forms";
import {
  filterResponses,
  hasLowRating,
  highestRating,
  isFiltered,
  lowestRating,
  lowRatingAtMost,
  lowRatingLabel,
  lowThisWeek,
  NO_FILTERS,
  toResponseFilter,
  presetRange,
  summarizeResponses,
  type ChoiceSummary,
  type ScaleSummary,
  type SummaryItem,
  type TextSummary,
} from "../summary";

const v1 = {
  schemaVersion: 1,
  id: "class",
  title: "Class",
  blocks: [
    { kind: "field", id: "r", key: "overall", type: "rating", label: "How was class?" },
    {
      kind: "field",
      id: "c",
      key: "liked",
      type: "single-choice",
      label: "Best part",
      props: {
        options: [
          { value: "coach", label: "Coaching" },
          { value: "dj", label: "The music" },
        ],
      },
    },
  ],
} as unknown as FormDefinition;

const v2 = {
  schemaVersion: 1,
  id: "class",
  title: "Class",
  blocks: [
    { kind: "field", id: "n", key: "name", type: "short-text", label: "Your name" },
    { kind: "field", id: "r2", key: "overall", type: "rating", label: "How was {{class|class}}?" },
    {
      kind: "field",
      id: "c2",
      key: "liked",
      type: "single-choice",
      label: "Best part",
      props: {
        options: [
          { value: "coach", label: "Coaching" },
          { value: "people", label: "The people" },
        ],
      },
    },
    {
      kind: "field",
      id: "m",
      key: "extras",
      type: "multi-choice",
      label: "Extras",
      props: {
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      },
    },
    { kind: "field", id: "y", key: "back", type: "yes-no", label: "Coming back?" },
    { kind: "field", id: "s", key: "nps", type: "nps", label: "Recommend us?" },
    { kind: "field", id: "t", key: "notes", type: "long-text", label: "Anything else?" },
    { kind: "content", id: "h", type: "heading", text: "Thanks" },
  ],
} as unknown as FormDefinition;

const item = (
  id: string,
  date: string,
  definition: FormDefinition,
  answers: Record<string, Json>,
  extra: SummaryItem["extra"] = {},
): SummaryItem => ({ id, date, definition, answers, extra });

const items: SummaryItem[] = [
  item("1", "2026-10-20", v1, { r: 5, c: "dj" }, { class: "6am", coach: "Sam" }),
  item(
    "2",
    "2026-10-22",
    v2,
    { n: "Ana", r2: 2, c2: "coach", m: ["a", "b"], y: true, s: 10, t: "Rower was broken" },
    { class: "6am", coach: "Lee" },
  ),
  item(
    "3",
    "2026-10-21",
    v2,
    { r2: 4, c2: "people", m: ["a"], y: false, s: 6, t: "  " },
    {
      class: "Noon",
      coach: "Sam",
    },
  ),
  item("4", "2026-10-22", v2, { s: 8, t: "Great music", m: [] }, { class: "Noon" }),
];

const summaries = summarizeResponses(items, [v2, v1], new Set(["name"]));
const byKey = (key: string) => summaries.find((s) => s.key === key)!;

describe("summarizeResponses", () => {
  it("has one summary per question in the newest version's order, skipping the given keys", () => {
    expect(summaries.map((s) => [s.key, s.kind])).toEqual([
      ["overall", "scale"],
      ["liked", "choice"],
      ["extras", "choice"],
      ["back", "choice"],
      ["nps", "scale"],
      ["notes", "text"],
    ]);
    expect(byKey("overall").label).toBe("How was class?");
  });

  it("averages a rating across versions and counts every value from 1 to the max", () => {
    const s = byKey("overall") as ScaleSummary;
    expect(s.count).toBe(3);
    expect(s.average).toBeCloseTo(11 / 3);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.buckets).toEqual([
      { value: 1, count: 0 },
      { value: 2, count: 1 },
      { value: 3, count: 0 },
      { value: 4, count: 1 },
      { value: 5, count: 1 },
    ]);
    expect(s.nps).toBeNull();
  });

  it("scores NPS from 0 to 10", () => {
    const s = byKey("nps") as ScaleSummary;
    expect(s.buckets).toHaveLength(11);
    expect(s.average).toBe(8);
    // One promoter (10), one passive (8), one detractor (6): 33% - 33% = 0.
    expect(s.nps).toEqual({ promoters: 1, passives: 1, detractors: 1, score: 0 });
  });

  it("counts choices with percentages, keeping options only older versions had", () => {
    const s = byKey("liked") as ChoiceSummary;
    expect(s.count).toBe(3);
    expect(s.multiple).toBe(false);
    expect(s.options.map((o) => [o.label, o.count, Math.round(o.percent)])).toEqual([
      ["Coaching", 1, 33],
      ["The people", 1, 33],
      ["The music", 1, 33],
    ]);
  });

  it("counts multiple choice per response, so percentages can pass 100", () => {
    const s = byKey("extras") as ChoiceSummary;
    expect(s.count).toBe(2); // an empty list isn't an answer
    expect(s.multiple).toBe(true);
    expect(s.options.map((o) => [o.value, o.count, o.percent])).toEqual([
      ["a", 2, 100],
      ["b", 1, 50],
    ]);
  });

  it("counts yes/no as Yes and No", () => {
    const s = byKey("back") as ChoiceSummary;
    expect(s.options.map((o) => [o.label, o.count])).toEqual([
      ["Yes", 1],
      ["No", 1],
    ]);
  });

  it("counts a consent as Agreed, and a dropdown by its options", () => {
    const def = {
      schemaVersion: 1,
      id: "c",
      title: "C",
      blocks: [
        { kind: "field", id: "k", key: "photos", type: "consent", label: "Photo consent" },
        {
          kind: "field",
          id: "d",
          key: "class",
          type: "dropdown",
          label: "Class",
          props: {
            options: [
              { value: "am", label: "6 AM" },
              { value: "pm", label: "6 PM" },
            ],
          },
        },
      ],
    } as unknown as FormDefinition;
    const list = summarizeResponses(
      [
        item("1", "2026-10-23", def, { k: true, d: "am" }),
        item("2", "2026-10-23", def, { k: true, d: "pm" }),
      ],
      [def],
    );
    const consent = list.find((x) => x.key === "photos") as ChoiceSummary;
    expect(consent.kind).toBe("choice");
    expect(consent.options.map((o) => [o.label, o.count])).toEqual([
      ["Agreed", 2],
      ["Didn't agree", 0],
    ]);
    const dropdown = list.find((x) => x.key === "class") as ChoiceSummary;
    expect(dropdown.options.map((o) => [o.label, o.count])).toEqual([
      ["6 AM", 1],
      ["6 PM", 1],
    ]);
  });

  it("lists text answers newest day first, leaving out blank ones", () => {
    const s = byKey("notes") as TextSummary;
    expect(s.count).toBe(2);
    expect(s.answers.map((a) => [a.id, a.text])).toEqual([
      ["2", "Rower was broken"],
      ["4", "Great music"],
    ]);
  });

  it("gives empty summaries when nothing is answered", () => {
    expect(summarizeResponses([], [v2])[0]).toEqual({
      kind: "text",
      key: "name",
      label: "Your name",
      fieldType: "short-text",
      count: 0,
      answers: [],
    });
    const rating = summarizeResponses([], [v2]).find((x) => x.key === "overall") as ScaleSummary;
    expect(rating.count).toBe(0);
    expect(rating.average).toBeNull();
    const choice = summarizeResponses([], [v2]).find((x) => x.key === "back") as ChoiceSummary;
    expect(choice.options.every((o) => o.percent === 0)).toBe(true);
  });

  it("keeps the newest version's scale, moving an older scale's answers onto it", () => {
    const ten = {
      ...v1,
      blocks: [
        { kind: "field", id: "r", key: "overall", type: "rating", label: "x", props: { max: 10 } },
      ],
    } as unknown as FormDefinition;
    const s = summarizeResponses(
      [
        item("a", "2026-10-01", ten, { r: 9 }),
        item("b", "2026-10-01", ten, { r: 10 }),
        item("c", "2026-10-02", v2, { r2: 5 }),
        item("d", "2026-10-02", v2, { r2: 1 }),
      ],
      [v2, ten],
    ).find((x) => x.key === "overall") as ScaleSummary;
    // Never "6.5 / 9": the scale is the newest version's 1–5.
    expect(s.max).toBe(5);
    expect(s.buckets).toHaveLength(5);
    expect(s.rescaled).toBe(2);
    expect(s.excluded).toBe(0);
    // 9 of 1–10 is 4.56 of 1–5 (shown at 5), 10 is 5.
    expect(s.buckets.at(-1)).toEqual({ value: 5, count: 3 });
    expect(s.buckets[0]).toEqual({ value: 1, count: 1 });
    expect(s.average).toBeCloseTo((1 + 8 * (4 / 9) + 5 + 5 + 1) / 4, 5);
  });

  it("leaves out answers outside their own question's scale, and says how many", () => {
    const s = summarizeResponses(
      [
        item("a", "2026-10-02", v2, { r2: 7 }),
        item("b", "2026-10-02", v2, { r2: 0 }),
        item("c", "2026-10-02", v2, { r2: 2.5 }),
        item("d", "2026-10-02", v2, { r2: 4 }),
      ],
      [v2],
    ).find((x) => x.key === "overall") as ScaleSummary;
    expect(s.count).toBe(1);
    expect(s.excluded).toBe(3);
    expect(s.average).toBe(4);
  });

  it("summarises 200,000 answers without overflowing the stack", () => {
    const many = Array.from({ length: 200_000 }, (_, i) =>
      item(`m${i}`, "2026-10-02", v2, { r2: (i % 5) + 1 }),
    );
    const started = Date.now();
    const s = summarizeResponses(many, [v2]).find((x) => x.key === "overall") as ScaleSummary;
    expect(s.count).toBe(200_000);
    expect(s.buckets.map((b) => b.count)).toEqual([40_000, 40_000, 40_000, 40_000, 40_000]);
    expect(s.average).toBe(3);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("counts a 5,000-option choice question without scanning the options per answer", () => {
    // Relative, not a fixed budget (CI runners vary): with lookups by value, 100× more options
    // barely changes the time; a scan per answer would make it ~100× slower.
    const run = (n: number) => {
      const options = Array.from({ length: n }, (_, i) => ({ value: `o${i}`, label: `Option ${i}` }));
      const def = {
        schemaVersion: 1,
        id: `big${n}`,
        title: "Big",
        blocks: [{ kind: "field", id: "b", key: "pick", type: "single-choice", label: "Pick", props: { options } }],
      } as unknown as FormDefinition;
      // Answers at the end of the list, where a scan would be slowest.
      const many = Array.from({ length: 20_000 }, (_, i) =>
        item(`b${i}`, "2026-10-02", def, { b: `o${n - 10 + (i % 10)}` }),
      );
      const times: number[] = [];
      let s: ChoiceSummary | undefined;
      for (let k = 0; k < 3; k++) {
        const started = performance.now();
        s = summarizeResponses(many, [def]).find((x) => x.key === "pick") as ChoiceSummary;
        times.push(performance.now() - started);
      }
      return { s: s!, ms: times.sort((x, y) => x - y)[1]! };
    };
    const small = run(50);
    const big = run(5_000);
    expect(big.s.options).toHaveLength(5_000);
    expect(big.s.options.filter((o) => o.count === 2_000)).toHaveLength(10);
    expect(big.ms).toBeLessThan(Math.max(small.ms * 10, 50));
  });
});

describe("filters", () => {
  it("finds the highest rating scale, leaving NPS out", () => {
    expect(highestRating([v2, v1])).toBe(5);
    expect(highestRating([])).toBeNull();
  });

  it("finds the lowest rating, leaving NPS out", () => {
    expect(lowestRating(items[1]!)).toBe(2);
    expect(lowestRating(items[3]!)).toBeNull();
  });

  it("filters by day range, extra values and a low rating", () => {
    const ids = (f: Parameters<typeof filterResponses>[1]) =>
      filterResponses(items, f).map((i) => i.id);
    expect(ids({})).toEqual(["1", "2", "3", "4"]);
    expect(ids({ from: "2026-10-21" })).toEqual(["2", "3", "4"]);
    expect(ids({ from: "2026-10-21", to: "2026-10-21" })).toEqual(["3"]);
    expect(ids({ match: { class: "6am" } })).toEqual(["1", "2"]);
    expect(ids({ match: { class: "6am", coach: "Sam" } })).toEqual(["1"]);
    expect(ids({ match: { class: "", coach: null } })).toEqual(["1", "2", "3", "4"]);
    expect(ids({ ratingAtMost: 2 })).toEqual(["2"]);
    expect(ids({ ratingAtMost: 4, from: "2026-10-21" })).toEqual(["2", "3"]);
  });

  it("knows when a filter leaves anything out", () => {
    expect(isFiltered({})).toBe(false);
    expect(isFiltered({ match: { class: "" } })).toBe(false);
    expect(isFiltered({ ratingAtMost: 2 })).toBe(true);
    expect(isFiltered({ low: true })).toBe(true);
    expect(isFiltered({ low: false })).toBe(false);
    expect(isFiltered({ from: "2026-10-01" })).toBe(true);
  });
});

const field = (type: string, max?: number) =>
  ({
    kind: "field",
    id: type,
    key: type,
    type,
    label: type,
    ...(max ? { props: { max } } : {}),
  }) as unknown as FieldBlock;
const formOf = (...blocks: FieldBlock[]) => ({ ...v1, blocks }) as unknown as FormDefinition;

describe("low ratings, on each question's own scale", () => {
  it("is the bottom 40% of a rating's scale, and detractors on NPS", () => {
    expect(lowRatingAtMost(field("rating"))).toBe(2); // 1–5
    expect(lowRatingAtMost(field("rating", 10))).toBe(4);
    expect(lowRatingAtMost(field("rating", 7))).toBe(2);
    expect(lowRatingAtMost(field("rating", 3))).toBe(1);
    expect(lowRatingAtMost(field("rating", 2))).toBe(1);
    expect(lowRatingAtMost(field("nps"))).toBe(6);
    expect(lowRatingAtMost(field("short-text"))).toBeNull();
  });

  it("finds a low answer on any rating or NPS question", () => {
    expect(items.map(hasLowRating)).toEqual([false, true, true, false]);
    const ten = formOf(field("rating", 10));
    expect(hasLowRating(item("a", "2026-10-22", ten, { rating: 4 }))).toBe(true);
    expect(hasLowRating(item("b", "2026-10-22", ten, { rating: 5 }))).toBe(false);
    const nps = formOf(field("nps"));
    expect(hasLowRating(item("c", "2026-10-22", nps, { nps: 0 }))).toBe(true);
    expect(hasLowRating(item("d", "2026-10-22", nps, { nps: 7 }))).toBe(false);
  });

  it("filters on it: a 2 out of 5, and an NPS of 6", () => {
    expect(filterResponses(items, { low: true }).map((i) => i.id)).toEqual(["2", "3"]);
  });

  it("says what counts as low", () => {
    expect(lowRatingLabel([v1])).toBe("2 or below");
    expect(lowRatingLabel([formOf(field("rating", 10))])).toBe("4 or below");
    expect(lowRatingLabel([v2, v1])).toBe("2 or below out of 5, 0–6 on NPS");
    expect(lowRatingLabel([formOf(field("rating", 10)), v1])).toBe(
      "2 or below out of 5, 4 or below out of 10",
    );
    expect(lowRatingLabel([formOf(field("nps"))])).toBe("0–6");
    expect(lowRatingLabel([formOf(field("short-text"))])).toBeNull();
    expect(lowRatingLabel([])).toBeNull();
  });
});

describe("presetRange", () => {
  it("turns presets into days, with weeks starting on Monday", () => {
    // 22 Oct 2026 is a Thursday.
    expect(presetRange("all", "2026-10-22")).toEqual({ from: null, to: null });
    expect(presetRange("today", "2026-10-22")).toEqual({ from: "2026-10-22", to: "2026-10-22" });
    expect(presetRange("week", "2026-10-22")).toEqual({ from: "2026-10-19", to: "2026-10-22" });
    expect(presetRange("week", "2026-10-19")).toEqual({ from: "2026-10-19", to: "2026-10-19" });
    expect(presetRange("week", "2026-10-25")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(presetRange("7d", "2026-11-02")).toEqual({ from: "2026-10-27", to: "2026-11-02" });
    expect(presetRange("30d", "2026-03-01")).toEqual({ from: "2026-01-31", to: "2026-03-01" });
    expect(presetRange("month", "2026-10-22")).toEqual({ from: "2026-10-01", to: "2026-10-22" });
  });
});

describe("the filter bar", () => {
  it("turns its value into a filter on the given day", () => {
    expect(toResponseFilter(NO_FILTERS, "2026-10-22")).toEqual({
      from: null,
      to: null,
      match: {},
      ratingAtMost: null,
      low: false,
    });
    expect(
      toResponseFilter({ ...NO_FILTERS, when: "custom", from: "2026-10-01", to: "" }, "2026-10-22"),
    ).toMatchObject({ from: "2026-10-01", to: null });
  });

  it("makes low ratings this week one step, keeping the other filters", () => {
    const next = lowThisWeek({ ...NO_FILTERS, match: { class: "6am" } });
    const filter = toResponseFilter(next, "2026-10-22");
    expect(filter).toEqual({
      from: "2026-10-19",
      to: "2026-10-22",
      match: { class: "6am" },
      ratingAtMost: null,
      low: true,
    });
    expect(filterResponses(items, filter).map((i) => i.id)).toEqual(["2"]);
    // Without the class: the NPS detractor (6) counts too.
    expect(
      filterResponses(items, toResponseFilter(lowThisWeek(NO_FILTERS), "2026-10-22")).map(
        (i) => i.id,
      ),
    ).toEqual(["2", "3"]);
  });
});

describe('summarizeResponses with an "Other" answer', () => {
  const areas = {
    schemaVersion: 1,
    id: "areas",
    title: "Areas",
    blocks: [
      {
        kind: "field",
        id: "a",
        key: "areas",
        type: "multi-choice",
        label: "Which area?",
        props: { options: [{ value: "parking", label: "Parking" }], other: true },
      },
    ],
  } as unknown as FormDefinition;

  it("counts typed answers together under Other", () => {
    const [summary] = summarizeResponses(
      [
        item("1", "2026-10-01", areas, { a: ["parking", "Lockers"] }),
        item("2", "2026-10-02", areas, { a: ["Mats"] }),
        item("3", "2026-10-03", areas, { a: ["parking"] }),
      ],
      [areas],
    ) as ChoiceSummary[];
    expect(summary!.options.map((o) => [o.label, o.count])).toEqual([
      ["Parking", 2],
      ["Other", 2],
    ]);
  });
});
