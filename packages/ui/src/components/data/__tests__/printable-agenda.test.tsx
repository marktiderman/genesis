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
    expect(ana.getByText(/Week of November 2 – November 8/)).toBeTruthy();
    expect(sheets[0]!.querySelectorAll("[data-day]")).toHaveLength(7);
    // 01:00Z on the 5th is 6 PM on the 4th in Denver.
    expect(within(sheets[0]!.querySelector('[data-day="2026-11-04"]') as HTMLElement).getByText("Family dinner")).toBeTruthy();
    expect(within(sheets[0]!.querySelector('[data-day="2026-11-04"]') as HTMLElement).getByText("6:00 PM")).toBeTruthy();
    expect(within(sheets[0]!.querySelector('[data-day="2026-11-08"]') as HTMLElement).getByText("Trip")).toBeTruthy();
    expect(ana.queryByText("Gym")).toBeNull();
    expect(screen.queryByText("Nobody's")).toBeNull();
    expect(sheets[0]!.className).toContain("print:break-after-page");
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
    render(<PrintButton />);
    const button = screen.getByTestId("print-button");
    expect(button.textContent).toContain("Print");
    expect(button.className).toContain("print:hidden");
    fireEvent.click(button);
    expect(print).toHaveBeenCalledOnce();
    window.print = before;
  });
});
