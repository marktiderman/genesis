// @feat:forms-studio
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { DropOffByQuestion } from "../DropOffByQuestion";
import { ResponsesFilters } from "../ResponsesFilters";
import { dropOffByQuestion, dropOffSummary } from "../dropoff";
import { comparisonFilter, headlineCards, headlineNumbers } from "../headline";
import {
  filterResponses,
  isFiltered,
  matchesStatus,
  NO_FILTERS,
  summarizeResponses,
  toResponseFilter,
  type SummaryItem,
} from "../summary";

const v1: FormDefinition = {
  schemaVersion: 1,
  id: "class",
  title: "Class",
  settings: { saveProgress: true },
  blocks: [
    { kind: "field", id: "r", key: "overall", type: "rating", label: "How was class?" },
    { kind: "field", id: "w", key: "went_well", type: "short-text", label: "What went well?" },
    { kind: "field", id: "n", key: "name", type: "short-text", label: "Your name" },
  ],
};
// v2 asks a new question second; ids differ, keys match.
const v2: FormDefinition = {
  ...v1,
  blocks: [
    { kind: "field", id: "r2", key: "overall", type: "rating", label: "How was class?" },
    { kind: "field", id: "c2", key: "coach", type: "short-text", label: "How was the coach?" },
    { kind: "field", id: "w2", key: "went_well", type: "short-text", label: "What went well?" },
    { kind: "field", id: "n2", key: "name", type: "short-text", label: "Your name" },
  ],
};

const item = (id: string, over: Partial<SummaryItem> = {}): SummaryItem => ({
  id,
  date: "2026-10-20",
  definition: v1,
  answers: { r: 4 },
  ...over,
});

const items: SummaryItem[] = [
  item("sent-1", { status: "completed", answers: { r: 5, w: "Pace" } }),
  item("sent-2"), // no status: sent
  item("partial-1", { status: "partial", furthest: "w", answers: { r: 2 } }),
  item("partial-2", { status: "partial", furthest: "n", answers: { r: 3, w: "Music" } }),
  item("partial-old", { status: "partial", answers: { r: 1 } }), // no furthest
  item("going", { status: "in_progress", furthest: "w", answers: { r: 4 } }),
  item("v2-partial", { definition: v2, status: "partial", furthest: "c2", answers: { r2: 3 } }),
];

describe("status filter", () => {
  it("shows sent and partial responses by default, never ones still in progress", () => {
    expect(matchesStatus({})).toBe(true);
    expect(matchesStatus({ status: "in_progress" })).toBe(false);
    const ids = (status?: Parameters<typeof matchesStatus>[1]) =>
      filterResponses(items, status ? { status } : {}).map((i) => i.id);
    expect(ids()).not.toContain("going");
    expect(ids()).toHaveLength(6);
    expect(ids("completed")).toEqual(["sent-1", "sent-2"]);
    expect(ids("partial")).toEqual(["partial-1", "partial-2", "partial-old", "v2-partial"]);
    expect(ids("in_progress")).toEqual(["going"]);
  });

  it("goes from the filter bar to the filter, and counts as filtering unless it's the default", () => {
    expect(toResponseFilter({ ...NO_FILTERS, status: "partial" }, "2026-10-23").status).toBe("partial");
    expect(isFiltered(toResponseFilter(NO_FILTERS, "2026-10-23"))).toBe(false);
    expect(isFiltered({ status: "counted" })).toBe(false);
    expect(isFiltered({ status: "in_progress" })).toBe(true);
    // The period before keeps it.
    expect(comparisonFilter({ ...NO_FILTERS, when: "week", status: "partial" }, "2026-10-23")?.filter.status).toBe(
      "partial",
    );
  });

  it("counts partial answers in the summaries, and the Responses card says how many", () => {
    const counted = filterResponses(items, {});
    const overall = summarizeResponses(counted, [v2, v1]).find((s) => s.key === "overall");
    expect(overall?.count).toBe(6);
    const headline = headlineNumbers(counted, [v2, v1]);
    expect(headline.responses.partial).toBe(4);
    expect(headlineCards(headline)[0]).toMatchObject({ key: "responses", value: 6, detail: "Including 4 partial" });
  });
});

describe("dropOffByQuestion", () => {
  it("counts each question's views and the people who stopped there, across versions by key", () => {
    const rows = dropOffByQuestion(items, [v2, v1]);
    expect(rows.map((r) => r.key)).toEqual(["overall", "coach", "went_well", "name"]);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    // Two sent, partial-1 (to went_well), partial-2 (to name), v2-partial (to coach).
    // partial-old has no furthest; "going" is still answering.
    expect(by["overall"]).toMatchObject({ views: 5, stopped: 0, dropOff: 0 });
    expect(by["coach"]).toMatchObject({ views: 1, stopped: 1, dropOff: 100 });
    expect(by["went_well"]).toMatchObject({ views: 4, stopped: 1, dropOff: 25 });
    expect(by["name"]).toMatchObject({ views: 3, stopped: 1, dropOff: 33 });
  });

  it("says nothing for a question nobody reached", () => {
    expect(dropOffByQuestion([], [v1])[0]).toEqual({
      key: "overall",
      label: "How was class?",
      views: 0,
      stopped: 0,
      dropOff: null,
    });
  });
});

// "Why not?" shows only to someone who isn't a member; a member jumps from "overall" past
// "trial" to "name". "Anything else?" shows to someone who gave their name, which the host
// keeps apart from the answers, and "Visit?" only to people a link marks as visitors.
const branching: FormDefinition = {
  schemaVersion: 1,
  id: "after-class",
  title: "After class",
  settings: { saveProgress: true },
  hidden: [{ name: "source", type: "string", source: "url" }],
  blocks: [
    { kind: "field", id: "member", key: "member", type: "yes-no", label: "Are you a member?" },
    { kind: "field", id: "why_not", key: "why_not", type: "short-text", label: "Why not?" },
    { kind: "field", id: "overall", key: "overall", type: "rating", label: "How was class?" },
    { kind: "field", id: "trial", key: "trial", type: "short-text", label: "How is your trial?" },
    { kind: "field", id: "name", key: "name", type: "short-text", label: "Your name" },
    { kind: "field", id: "more", key: "more", type: "long-text", label: "Anything else?" },
    { kind: "field", id: "visit", key: "visit", type: "short-text", label: "Visit?" },
  ],
  logic: [
    {
      id: "only-guests",
      when: { op: "eq", left: { field: "member" }, right: { value: false } },
      effect: "show",
      target: "why_not",
    },
    {
      id: "members-skip-trial",
      when: { op: "eq", left: { field: "member" }, right: { value: true } },
      effect: "jump",
      from: "overall",
      to: "name",
    },
    { id: "named", when: { op: "answered", left: { field: "name" } }, effect: "show", target: "more" },
    {
      id: "visitors",
      when: { op: "eq", left: { hidden: "source" }, right: { value: "visitor" } },
      effect: "show",
      target: "visit",
    },
  ],
};

describe("dropOffByQuestion on each respondent's path", () => {
  const b = (id: string, over: Partial<SummaryItem>): SummaryItem => ({
    id,
    date: "2026-10-20",
    definition: branching,
    answers: {},
    ...over,
  });
  const rows = dropOffByQuestion(
    [
      // A member, name kept apart: never sees "Why not?" or "trial", does see "more".
      b("member", { answers: { member: true, overall: 5, more: "Thanks" }, extraAnswers: { name: "Sam" } }),
      // A guest from a visitor link, no name: every question but "more".
      b("guest", {
        answers: { member: false, why_not: "Visiting", overall: 4, trial: "Good", visit: "Yes" },
        hidden: { source: "visitor" },
      }),
      // A member who stopped on "overall".
      b("stopped", { status: "partial", furthest: "overall", answers: { member: true, overall: 2 } }),
      // The same response twice counts once.
      b("stopped", { status: "partial", furthest: "overall", answers: { member: true, overall: 2 } }),
    ],
    [branching],
  );
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));

  it("counts a question logic hid or jumped over as neither viewed nor left", () => {
    expect(by["member"]).toMatchObject({ views: 3, stopped: 0 });
    expect(by["why_not"]).toMatchObject({ views: 1, stopped: 0 });
    expect(by["overall"]).toMatchObject({ views: 3, stopped: 1, dropOff: 33 });
    expect(by["trial"]).toMatchObject({ views: 1, stopped: 0 });
    expect(by["name"]).toMatchObject({ views: 2, stopped: 0 });
  });

  it("fills a null placeholder in answers from extraAnswers", () => {
    const [kept, placeholder] = (
      [
        { answers: { member: true, overall: 5, more: "Thanks" }, extraAnswers: { name: "Sam" } },
        { answers: { member: true, overall: 5, more: "Thanks", name: null }, extraAnswers: { name: "Sam" } },
      ] as Partial<SummaryItem>[]
    ).map((over) => dropOffByQuestion([b("one", over)], [branching]).find((r) => r.key === "more"));
    expect(placeholder).toEqual(kept);
  });

  it("follows logic reading answers kept apart and hidden inputs", () => {
    expect(by["more"]).toMatchObject({ views: 1 });
    expect(by["visit"]).toMatchObject({ views: 1 });
  });
});

describe("dropOffSummary", () => {
  it("counts everyone who started: sent, partial and in progress, each once", () => {
    // Seven responses: two sent, four partial (one without a furthest question), one in progress.
    expect(dropOffSummary(items, [v2, v1]).started).toBe(7);
    expect(dropOffSummary([...items, items[0]!], [v2, v1]).started).toBe(7);
    expect(dropOffSummary(items, [v2, v1]).dropOffs).toEqual(dropOffByQuestion(items, [v2, v1]));
  });
});

describe("<DropOffByQuestion>", () => {
  it("lists each question with its views, stops and drop-off", () => {
    render(<DropOffByQuestion {...dropOffSummary(items, [v2, v1])} />);
    const card = screen.getByTestId("drop-off");
    expect(within(card).getByText("7 people started")).toBeTruthy();
    const wentWell = screen.getByTestId("drop-off-went_well");
    expect(wentWell.textContent).toContain("What went well?");
    expect(wentWell.textContent).toContain("25% drop-off");
    expect(wentWell.textContent).toContain("4 views · 1 stopped here");
  });

  it("falls back to the first question's views without started", () => {
    render(<DropOffByQuestion dropOffs={dropOffByQuestion(items, [v2, v1])} />);
    expect(screen.getByText("5 people started")).toBeTruthy();
  });

  it("says when nobody has started", () => {
    render(<DropOffByQuestion dropOffs={dropOffByQuestion([], [v1])} />);
    expect(screen.getByText("Nobody has started yet")).toBeTruthy();
    expect(screen.queryByTestId("drop-off-overall")).toBeNull();
  });
});

describe("<ResponsesFilters statuses>", () => {
  it("shows the status filter only when asked", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ResponsesFilters value={NO_FILTERS} onChange={onChange} filtered={false} />);
    expect(screen.queryByTestId("responses-status")).toBeNull();
    rerender(<ResponsesFilters value={NO_FILTERS} onChange={onChange} filtered={false} statuses />);
    const trigger = screen.getByTestId("responses-status");
    expect(trigger.textContent).toContain("Sent and partial");
    fireEvent.click(trigger);
  });
});
