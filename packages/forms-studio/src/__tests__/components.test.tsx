// @feat:forms-studio
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ResponsesFilters } from "../ResponsesFilters";
import { QuestionSummaryCards } from "../QuestionSummaryCards";
import { HeadlineNumbers, ReadinessChip, ResourceHeader, ShareDialog } from "../moved";
import { headlineCards, headlineNumbers } from "../headline";
import { needsFollowUp } from "../followups";
import { NO_FILTERS, summarizeResponses } from "../summary";
import { formStatusChip } from "../status";
import { answer, checkIn } from "./fixtures";

describe("Moved to genesis-ui, in a form's words", () => {
  it("keeps the header's form status chip", () => {
    render(<ResourceHeader title="E2E Saturday check-in" parent={<a href="/forms">Forms</a>} status={formStatusChip("live", 1)} />);
    expect(screen.getByTestId("resource-status").textContent).toBe("Live · version 1");
  });

  it("says an empty form needs a question", () => {
    render(<ReadinessChip readiness={{ state: "empty", count: 0 }} />);
    expect(screen.getByTestId("readiness").textContent).toBe("Add a question");
  });

  it("shares a form, as before", () => {
    render(<ShareDialog open onOpenChange={() => {}} url="https://app.test/f/a" name="A" />);
    expect(screen.getByRole("heading", { name: "Share your form" })).toBeTruthy();
    expect(screen.getByText("Anyone with the link can answer.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the form" })).toBeTruthy();
  });

  it("still takes another noun", () => {
    render(<ShareDialog open onOpenChange={() => {}} url="https://app.test/c/a" name="A" noun="course" />);
    expect(screen.getByRole("heading", { name: "Share your course" })).toBeTruthy();
  });
});

describe("Responses filters", () => {
  it("turns low ratings on as this week, and off with its ×", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ResponsesFilters value={NO_FILTERS} onChange={onChange} lowLabel="2 or below" filtered={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Low ratings this week" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...NO_FILTERS, when: "week", low: true });
    rerender(
      <ResponsesFilters
        value={{ ...NO_FILTERS, when: "week", low: true }}
        onChange={onChange}
        lowLabel="2 or below"
        filtered
      />,
    );
    expect(screen.getByTestId("low-ratings-chip").textContent).toContain("Low ratings (2 or below)");
    fireEvent.click(screen.getByRole("button", { name: "Show every rating" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...NO_FILTERS, when: "week", low: false });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onChange).toHaveBeenLastCalledWith(NO_FILTERS);
  });

  it("hides a choice filter with no options", () => {
    render(
      <ResponsesFilters
        value={NO_FILTERS}
        onChange={() => {}}
        filtered={false}
        choices={[
          { key: "class", label: "Class", allLabel: "Any class", options: ["6:00 class"] },
          { key: "coach", label: "Coach", allLabel: "Any coach", options: [] },
        ]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Class" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Coach" })).toBeNull();
  });
});

describe("Headline numbers and question cards", () => {
  const items = [
    answer("2026-10-23", { score: 5, photo: true }),
    answer("2026-10-23", { score: 2, photo: false, wrong: "Rower was broken again" }),
  ];

  it("shows the four cards with their details", () => {
    const h = headlineNumbers(items, [checkIn], { previous: [items[0]!], skip: new Set(["name"]) });
    render(<HeadlineNumbers numbers={headlineCards(h, { period: "last week" })} />);
    expect(screen.getByTestId("headline-responses").textContent).toBe("Responses2+1 vs last week");
    expect(screen.getByTestId("headline-rating").textContent).toBe("Average rating3.5 / 5Down 1.5");
    expect(screen.getByTestId("headline-low").textContent).toBe("Low ratings1Needs a follow-up");
    expect(screen.getByTestId("headline-rate").textContent).toBe("Photo consent50%1 of 2 agreed");
  });

  it("counts low ratings as the follow-up list does, leaving skipped keys out", () => {
    const rated = { ...checkIn, blocks: [...checkIn.blocks, { kind: "field", id: "s", key: "staff", type: "rating", label: "Staff only", props: { max: 5 } }] } as typeof checkIn;
    const lowOnlyInSkipped = [{ ...answer("2026-10-23", { score: 5 }), definition: rated, answers: { r: 5, s: 1 } }];
    const skip = new Set(["staff"]);
    const h = headlineNumbers(lowOnlyInSkipped, [rated], { skip });
    expect(h.low).toEqual({ count: 0 });
    expect(needsFollowUp(lowOnlyInSkipped, { skip })).toHaveLength(0);
  });

  it("says how many answers came from an earlier scale", () => {
    const ten = { ...checkIn, blocks: [{ kind: "field", id: "r", key: "score", type: "rating", label: "How was today's class?", props: { max: 10 } }] } as typeof checkIn;
    const mixed = [{ ...answer("2026-10-22", {}), definition: ten, answers: { r: 9 } }, answer("2026-10-23", { score: 4 })];
    render(<QuestionSummaryCards summaries={summarizeResponses(mixed, [checkIn, ten])} responses={2} />);
    expect(screen.getByTestId("scale-note-score").textContent).toBe("1 answer from an earlier version's scale moved onto 1–5.");
  });

  it("says when every low rating is followed up", () => {
    const h = headlineNumbers(items, [checkIn]);
    render(<HeadlineNumbers numbers={headlineCards(h, { lowOpen: 0 })} />);
    expect(screen.getByTestId("headline-low").textContent).toBe("Low ratings1All followed up");
  });

  it("shows each question's spread, consent as one bar, and written answers", () => {
    render(
      <QuestionSummaryCards
        summaries={summarizeResponses(items, [checkIn], new Set(["name"]))}
        responses={items.length}
        today="2026-10-23"
        answerMeta={() => "rated 2"}
      />,
    );
    const rating = screen.getByTestId("summary-score");
    expect(within(rating).getByText("2 answers · average 3.5")).toBeTruthy();
    expect(within(screen.getByTestId("summary-photo")).getByText("Agreed · 1 (50%)")).toBeTruthy();
    const text = screen.getByTestId("summary-wrong");
    expect(within(text).getByText("“Rower was broken again”")).toBeTruthy();
    expect(within(text).getByText(/Today · rated 2/)).toBeTruthy();
  });

  it("says nothing matches, with a way out", () => {
    const onClear = vi.fn();
    render(<QuestionSummaryCards summaries={[]} responses={0} emptyTitle="No responses yet" onClearFilters={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: /Clear all filters/ }));
    expect(onClear).toHaveBeenCalled();
  });
});
