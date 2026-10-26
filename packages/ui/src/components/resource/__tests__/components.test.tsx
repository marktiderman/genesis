// @feat:resource-workspace
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Button } from "../../ui/button";
import {
  FollowUpList,
  HeadlineNumbers,
  ReadinessChip,
  ResourceHeader,
  ResourceSettingsPage,
  ResponsesToolbar,
  SettingsSection,
  ShareDialog,
  SummaryCard,
} from "..";

describe("ResourceHeader", () => {
  it("shows the title once, the breadcrumb and both chips", () => {
    render(
      <ResourceHeader
        title="Intro to strength"
        parent={<a href="/courses">Courses</a>}
        status={{ label: "Live · version 1", tone: "success" }}
        saveState="saved"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Intro to strength");
    const parent = screen.getByRole("link", { name: "Courses" });
    expect(parent.getAttribute("href")).toBe("/courses");
    // The host's link is used as is, never inside another <a>.
    expect(parent.parentElement?.closest("a")).toBeNull();
    expect(screen.getByTestId("resource-status").textContent).toBe("Live · version 1");
    expect(screen.getByTestId("resource-save-state").textContent).toBe("Changes saved");
  });

  it("shows only the actions it's given, and runs them", () => {
    const onUndo = vi.fn();
    const onShare = vi.fn();
    const onPublish = vi.fn();
    render(
      <ResourceHeader
        title="Lesson"
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

  it("leaves undo and redo out without handlers, and names an untitled item", () => {
    render(<ResourceHeader title="  " untitled="Untitled worksheet" />);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByRole("heading").textContent).toBe("Untitled worksheet");
  });
});

describe("ReadinessChip", () => {
  it("says it's ready", () => {
    render(<ReadinessChip readiness={{ state: "ready", count: 0 }} />);
    expect(screen.getByTestId("readiness").textContent).toBe("Ready to publish");
  });

  it("is a button when it opens the checks", () => {
    const onClick = vi.fn();
    render(<ReadinessChip readiness={{ state: "problems", count: 3 }} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "3 problems to fix" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("takes the host's word for empty", () => {
    render(<ReadinessChip readiness={{ state: "empty", count: 0 }} labels={{ empty: "Add a lesson" }} />);
    expect(screen.getByTestId("readiness").textContent).toBe("Add a lesson");
  });
});

describe("ResponsesToolbar", () => {
  it("switches between Summary and Each response, with the host's actions", () => {
    const onView = vi.fn();
    render(<ResponsesToolbar view="summary" onViewChange={onView} actions={<Button>Download CSV</Button>} />);
    fireEvent.click(screen.getByRole("radio", { name: "Each response" }));
    expect(onView).toHaveBeenCalledWith("each");
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeTruthy();
  });

  it("takes the host's words", () => {
    render(
      <ResponsesToolbar view="each" onViewChange={() => {}} labels={{ each: "Each submission", group: "Show submissions as" }} />,
    );
    expect(screen.getByLabelText("Show submissions as")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Each submission" })).toBeTruthy();
  });
});

describe("HeadlineNumbers and SummaryCard", () => {
  it("shows each number with its detail", () => {
    render(
      <HeadlineNumbers
        numbers={[
          { key: "enrolled", label: "Enrolled", value: 24, detail: "+3 vs last week", tone: "positive" },
          { key: "done", label: "Completed", value: "62%" },
        ]}
      />,
    );
    expect(screen.getByTestId("headline-enrolled").textContent).toBe("Enrolled24+3 vs last week");
    expect(screen.getByTestId("headline-done").textContent).toBe("Completed62%");
  });

  it("renders nothing without numbers", () => {
    const { container } = render(<HeadlineNumbers numbers={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("names a summary card by its title", () => {
    render(
      <SummaryCard title="Lesson 1" meta="18 responses" testID="card">
        <p>bars</p>
      </SummaryCard>,
    );
    expect(within(screen.getByRole("region", { name: "Lesson 1" })).getByText("18 responses")).toBeTruthy();
  });
});

describe("FollowUpList", () => {
  it("lists each entry with its tag, score, comment and actions", () => {
    const handled = vi.fn();
    render(
      <FollowUpList
        entries={[
          { id: "1", name: "Priya Shah", tag: { label: "Member", tone: "success" }, meta: "Today · Lesson 2", comment: "The video didn't load", rating: { value: 2, max: 5 } },
          { id: "2", name: "Anonymous", rating: { value: 1, max: 5 } },
        ]}
        actions={(e) => <Button onClick={() => handled(e.id)}>Mark handled</Button>}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const first = screen.getByTestId("follow-up-1");
    expect(within(first).getByText("Member")).toBeTruthy();
    expect(within(first).getByRole("img", { name: "Rated 2 out of 5" })).toBeTruthy();
    expect(within(screen.getByTestId("follow-up-2")).getByText("No comment")).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "Mark handled" }));
    expect(handled).toHaveBeenCalledWith("1");
  });

  it("says when there is nothing to follow up, and takes the host's words", () => {
    render(<FollowUpList entries={[{ id: "1", name: "Ann" }]} noComment="No note" />);
    expect(screen.getByText("No note")).toBeTruthy();
  });

  it("says when the list is empty", () => {
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
          { id: "course", title: "Course", onSelect },
          { id: "sharing", title: "Sharing", description: "The link people open.", content: <p>Link row</p> },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#course", "#sharing"]);
    expect(screen.getByRole("region", { name: "Sharing" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Course" })).toBeNull();
    fireEvent.click(within(nav).getByRole("link", { name: "Course" }));
    expect(onSelect).toHaveBeenCalled();
    expect(within(nav).getByRole("link", { name: "Course" }).getAttribute("aria-current")).toBe("location");
  });

  it("names a section by its title", () => {
    render(
      <SettingsSection id="open" title="When it's open" description="Pause, schedule or cap it.">
        <p>rows</p>
      </SettingsSection>,
    );
    expect(screen.getByRole("region", { name: "When it's open" }).id).toBe("open");
  });
});

describe("ShareDialog", () => {
  it("speaks of a page by default, or the host's noun", () => {
    const { rerender } = render(<ShareDialog open onOpenChange={() => {}} url="https://app.test/p/a" name="A" />);
    expect(screen.getByRole("heading", { name: "Share your page" })).toBeTruthy();
    expect(screen.getByText("Anyone with the link can open it.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the page" })).toBeTruthy();
    rerender(<ShareDialog open onOpenChange={() => {}} url="https://app.test/p/a" name="A" noun="course" />);
    expect(screen.getByRole("heading", { name: "Share your course" })).toBeTruthy();
  });

  it("copies the embed code", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareDialog open onOpenChange={() => {}} url="https://app.test/p/a" name="A" defaultTab="embed" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy embed code" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('<iframe src="https://app.test/p/a"'));
  });

  it("builds a prefilled link and its poster from the choices", async () => {
    render(
      <ShareDialog
        open
        onOpenChange={() => {}}
        url="https://app.test/p/a"
        name="A"
        posterUrl={(url, values) => (Object.keys(values).length ? `${url}/poster?location=${values["location"]}` : null)}
        prefill={[{ key: "location", label: "Location", anyLabel: "Any location", options: [{ value: "north", label: "North hall" }] }]}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Location" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "North hall" }));
    expect((screen.getByLabelText("Prefilled link") as HTMLInputElement).value).toBe("https://app.test/p/a?location=north");
    expect(screen.getByRole("link", { name: "Print a poster for this link" }).getAttribute("href")).toBe(
      "https://app.test/p/a/poster?location=north",
    );
  });

  it("doesn't throw on a relative link", () => {
    render(
      <ShareDialog
        open
        onOpenChange={() => {}}
        url="/p/a"
        name="A"
        prefill={[{ key: "location", label: "Location", anyLabel: "Any location", options: [{ value: "n", label: "North" }] }]}
      />,
    );
    expect((screen.getByRole("textbox", { name: "Link" }) as HTMLInputElement).value).toBe("/p/a");
  });

  it("shows the link and opens on the tab asked for", () => {
    render(<ShareDialog open onOpenChange={() => {}} url="https://app.test/p/a" name="A" defaultTab="embed" />);
    expect(screen.getByRole("tab", { name: "Embed" }).getAttribute("data-state")).toBe("active");
    expect((screen.getByLabelText("Embed on your website") as HTMLTextAreaElement).value).toContain('src="https://app.test/p/a"');
  });
});
