// @feat:resource-view-calendar
/**
 * PrintableAgenda: one sheet per lane for one week, each lane's own events by day on the given
 * clock, every day listed by default, the app's sections under each week, and a page break per
 * sheet. PrintButton opens the browser's print dialog and hides itself in print.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrintableAgenda, PrintButton, type CalendarEvent } from "../calendar";

const Z = "America/Denver";
const events: CalendarEvent[] = [
  { key: "dinner", title: "Family dinner", start: new Date("2026-11-05T01:00:00Z"), end: new Date("2026-11-05T02:00:00Z"), lanes: ["ana", "ben"] },
  { key: "trip", title: "Trip", start: "2026-11-07", end: "2026-11-08", lanes: ["ana"] },
  { key: "gym", title: "Gym", start: new Date("2026-11-03T13:00:00Z"), end: new Date("2026-11-03T14:00:00Z"), lanes: ["ben"] },
  { key: "loose", title: "Nobody's", start: "2026-11-04" },
];
const lanes = [
  { key: "ana", label: "Ana" },
  { key: "ben", label: "Ben" },
];

describe("PrintableAgenda", () => {
  it("prints one sheet per lane, with only that lane's events, every day of the week", () => {
    render(<PrintableAgenda events={events} lanes={lanes} anchor="2026-11-04" timeZone={Z} locale="en-US" />);
    const sheets = screen.getAllByTestId("printable-agenda-sheet");
    expect(sheets.map((s) => s.getAttribute("data-lane"))).toEqual(["ana", "ben"]);
    const ana = within(sheets[0]!);
    expect(ana.getByText("Ana")).toBeTruthy();
    // The locale's own range form, not a hard-coded dash.
    expect(ana.getByText(/Week of November 2\s*–\s*8/)).toBeTruthy();
    expect(sheets[0]!.querySelectorAll("[data-day]")).toHaveLength(7);
    // 01:00Z on the 5th is 6 PM on the 4th in Denver.
    expect(within(sheets[0]!.querySelector('[data-day="2026-11-04"]') as HTMLElement).getByText("Family dinner")).toBeTruthy();
    expect(within(sheets[0]!.querySelector('[data-day="2026-11-04"]') as HTMLElement).getByText(/6:00\s*–\s*7:00\s*PM/)).toBeTruthy();
    expect(within(sheets[0]!.querySelector('[data-day="2026-11-08"]') as HTMLElement).getByText("Trip")).toBeTruthy();
    expect(ana.queryByText("Gym")).toBeNull();
    expect(screen.queryByText("Nobody's")).toBeNull();
    expect(sheets[0]!.className).toContain("print:break-after-page");
    // The last sheet ends the print job, with no blank page after it.
    expect(sheets[0]!.className).toContain("print:last:break-after-auto");
  });

  it("adds the app's sections under each week, leaving one off where it renders nothing", () => {
    render(
      <PrintableAgenda
        events={events}
        lanes={lanes}
        anchor="2026-11-04"
        timeZone={Z}
        sections={[
          { key: "note", title: "This week", render: (lane) => <p>Notes for {lane.label}</p> },
          { key: "goals", title: "Goals", render: (lane) => (lane.key === "ana" ? <p>Read daily</p> : null) },
        ]}
      />,
    );
    const [ana, ben] = screen.getAllByTestId("printable-agenda-sheet");
    expect(within(ana!).getByText("Notes for Ana")).toBeTruthy();
    expect(within(ana!).getByText("Read daily")).toBeTruthy();
    expect(within(ben!).getByText("Notes for Ben")).toBeTruthy();
    expect(ben!.querySelector('[data-section="goals"]')).toBeNull();
  });

  it("can leave empty days off", () => {
    render(<PrintableAgenda events={events} lanes={[lanes[1]!]} anchor="2026-11-04" timeZone={Z} showEmptyDays={false} />);
    expect(screen.getByTestId("printable-agenda-sheet").querySelectorAll("[data-day]")).toHaveLength(2);
  });
});

describe("PrintButton", () => {
  it("opens the print dialog and hides itself in print", () => {
    const print = vi.fn();
    const before = window.print;
    window.print = print;
    try {
      render(<PrintButton />);
      const button = screen.getByTestId("print-button");
      expect(button.textContent).toContain("Print");
      expect(button.className).toContain("print:hidden");
      fireEvent.click(button);
      expect(print).toHaveBeenCalledOnce();
    } finally {
      window.print = before;
    }
  });
});

describe("PrintableAgenda: review", () => {
  it("titles each sheet with its lane's label at the heading level asked for", () => {
    render(<PrintableAgenda events={events} lanes={[{ key: "u-123", label: "Ana" }]} anchor="2026-11-04" timeZone={Z} headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Ana");
    expect(screen.queryByText("u-123")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0);
  });

  it("says when an overnight event ends, and tells two 1:30 AMs apart", () => {
    const night: CalendarEvent[] = [
      // 22:00 on the 31st to 02:00 on 1 November, Denver.
      { key: "late", title: "Late shift", start: new Date("2026-11-01T04:00:00Z"), end: new Date("2026-11-01T09:00:00Z"), lanes: ["ana"] },
      // The two 01:30s on 1 November 2026 (MDT, then MST).
      { key: "first", title: "First", start: new Date("2026-11-01T07:30:00Z"), lanes: ["ana"] },
      { key: "second", title: "Second", start: new Date("2026-11-01T08:30:00Z"), lanes: ["ana"] },
    ];
    render(<PrintableAgenda events={night} lanes={[{ key: "ana", label: "Ana" }]} anchor="2026-11-01" weekStartsOn={0} timeZone={Z} locale="en-US" />);
    const sunday = within(document.querySelector('[data-day="2026-11-01"]') as HTMLElement);
    expect(sunday.getByText("until 2:00 AM")).toBeTruthy();
    const first = sunday.getByText("First").previousSibling!.textContent!;
    const second = sunday.getByText("Second").previousSibling!.textContent!;
    expect(first).not.toBe(second);
    expect(first).toMatch(/1:30.*MDT/);
    expect(second).toMatch(/1:30.*MST/);
  });
});
