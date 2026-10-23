// @feat:forms-studio
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Button } from "@marktiderman/genesis-ui";
import { ResourceHeader } from "../generic/ResourceHeader";
import { ReadinessChip, SubNavTabsFallback } from "../generic/nav";
import { ResponsesFilters } from "../ResponsesFilters";
import { ResponsesToolbar } from "../generic/ResponsesToolbar";
import { HeadlineNumbers } from "../generic/HeadlineNumbers";
import { QuestionSummaryCards } from "../QuestionSummaryCards";
import { FollowUpList } from "../generic/FollowUpList";
import { ResourceSettingsPage, SettingsSection } from "../generic/settings";
import { ShareDialog } from "../generic/ShareDialog";
import { headlineCards, headlineNumbers } from "../headline";
import { NO_FILTERS, summarizeResponses } from "../summary";
import { formNavItems, formStatusChip } from "../status";
import { answer, checkIn } from "./fixtures";

describe("ResourceHeader", () => {
  it("shows the title once, the breadcrumb and both chips", () => {
    render(
      <ResourceHeader
        title="E2E Saturday check-in"
        parent={<a href="/forms">Forms</a>}
        status={formStatusChip("live", 1)}
        saveState="saved"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("E2E Saturday check-in");
    expect(screen.getByRole("link", { name: "Forms" }).getAttribute("href")).toBe("/forms");
    expect(screen.getByTestId("resource-status").textContent).toBe("Live · version 1");
    expect(screen.getByTestId("resource-save-state").textContent).toBe("Changes saved");
  });

  it("shows only the actions it's given, and runs them", () => {
    const onUndo = vi.fn();
    const onShare = vi.fn();
    const onPublish = vi.fn();
    render(
      <ResourceHeader
        title="Form"
        onUndo={onUndo}
        onRedo={() => {}}
        canRedo={false}
        onShare={onShare}
        publish={{ onClick: onPublish, label: "Publish changes" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    expect(onShare).toHaveBeenCalled();
    expect(onPublish).toHaveBeenCalled();
  });

  it("leaves undo and redo out without handlers, and names an untitled form", () => {
    render(<ResourceHeader title="  " untitled="Untitled form" />);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByRole("heading").textContent).toBe("Untitled form");
  });
});

describe("SubNavTabsFallback and ReadinessChip", () => {
  it("shows the four places with counts, and the readiness chip", () => {
    const onChange = vi.fn();
    render(
      <SubNavTabsFallback
        items={formNavItems({ questions: 2, logic: 1, responses: 24 })}
        value="questions"
        onValueChange={onChange}
        trailing={<ReadinessChip readiness={{ state: "ready", count: 0 }} />}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Questions2", "Logic and endings1", "Responses24", "Settings"]);
    expect(screen.getByTestId("readiness").textContent).toBe("Ready to publish");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Responses/ }));
    expect(onChange).toHaveBeenCalledWith("responses");
  });

  it("is a button when it opens the checks", () => {
    const onClick = vi.fn();
    render(<ReadinessChip readiness={{ state: "problems", count: 3 }} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "3 problems to fix" }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("Responses toolbar and filters", () => {
  it("switches between Summary and Each response, with the host's actions", () => {
    const onView = vi.fn();
    render(<ResponsesToolbar view="summary" onViewChange={onView} actions={<Button>Download CSV</Button>} />);
    fireEvent.click(screen.getByRole("radio", { name: "Each response" }));
    expect(onView).toHaveBeenCalledWith("each");
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeTruthy();
  });

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
          { key: "class", label: "Class", allLabel: "Any class", options: ["6:00 WOD"] },
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
    answer("2026-10-23", { wod: 5, photo: true }),
    answer("2026-10-23", { wod: 2, photo: false, wrong: "Rower was broken again" }),
  ];

  it("shows the four cards with their details", () => {
    const h = headlineNumbers(items, [checkIn], { previous: [items[0]!], skip: new Set(["name"]) });
    render(<HeadlineNumbers numbers={headlineCards(h, { period: "last week" })} />);
    expect(screen.getByTestId("headline-responses").textContent).toBe("Responses2+1 vs last week");
    expect(screen.getByTestId("headline-rating").textContent).toBe("Average rating3.5 / 5Down 1.5");
    expect(screen.getByTestId("headline-low").textContent).toBe("Low ratings1Needs a follow-up");
    expect(screen.getByTestId("headline-rate").textContent).toBe("Photo consent50%1 of 2 agreed");
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
    const rating = screen.getByTestId("summary-wod");
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

describe("FollowUpList", () => {
  it("lists each entry with its tag, score, comment and actions", () => {
    const handled = vi.fn();
    render(
      <FollowUpList
        entries={[
          { id: "1", name: "Priya Shah", tag: { label: "Member", tone: "success" }, meta: "Today · 6:00 WOD · Leo", comment: "Rower was broken again", rating: { value: 2, max: 5 } },
          { id: "2", name: "Anonymous", rating: { value: 1, max: 5 } },
        ]}
        actions={(e) => <Button onClick={() => handled(e.id)}>Mark handled</Button>}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const first = screen.getByTestId("follow-up-1");
    expect(within(first).getByText("Member")).toBeTruthy();
    expect(within(first).getByLabelText("Rated 2 out of 5")).toBeTruthy();
    expect(within(screen.getByTestId("follow-up-2")).getByText("No comment")).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "Mark handled" }));
    expect(handled).toHaveBeenCalledWith("1");
  });

  it("says when there is nothing to follow up", () => {
    render(<FollowUpList entries={[]} />);
    expect(screen.getByText(/Nothing to follow up/)).toBeTruthy();
  });
});

describe("Settings", () => {
  it("lays out sections with jump links, and link-only entries", () => {
    const onSelect = vi.fn();
    render(
      <ResourceSettingsPage
        sections={[
          { id: "form", title: "Form", onSelect },
          { id: "sharing", title: "Sharing", description: "The link people open.", content: <p>Link row</p> },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#form", "#sharing"]);
    expect(screen.getByRole("region", { name: "Sharing" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Form" })).toBeNull();
    fireEvent.click(within(nav).getByRole("link", { name: "Form" }));
    expect(onSelect).toHaveBeenCalled();
    expect(within(nav).getByRole("link", { name: "Form" }).getAttribute("aria-current")).toBe("location");
  });

  it("names a section by its title", () => {
    render(
      <SettingsSection id="open" title="When it's open" description="Pause, schedule or cap responses.">
        <p>rows</p>
      </SettingsSection>,
    );
    expect(screen.getByRole("region", { name: "When it's open" }).id).toBe("open");
  });
});

describe("ShareDialog", () => {
  it("shows the link and opens on the tab asked for", () => {
    render(
      <ShareDialog open onOpenChange={() => {}} url="https://app.test/f/a" name="A" defaultTab="embed" />,
    );
    expect(screen.getByRole("tab", { name: "Embed" }).getAttribute("data-state")).toBe("active");
    expect((screen.getByLabelText("Embed on your website") as HTMLTextAreaElement).value).toContain(
      'src="https://app.test/f/a"',
    );
  });
});
