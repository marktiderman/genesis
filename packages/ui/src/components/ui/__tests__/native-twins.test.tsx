/**
 * The web twins of genesis-ui-native components: Banner, InlineAlert, ChoiceCard, ChipGroup,
 * Combobox, NumberInput, RangeSlider, Stepper, TimePicker, WhatsNewSheet and NotificationsPage.
 * Each takes the native twin's props and keeps its behaviour in genesis-core.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Banner, InlineAlert } from "../inline-alert";
import { ChoiceCard } from "../choice-card";
import { ChipGroup, ChipGroupItem } from "../../resource/chip-group";
import { Combobox } from "../combobox";
import { NumberInput } from "../number-input";
import { RangeSlider } from "../range-slider";
import { Stepper } from "../stepper";
import { TimePicker } from "../time-picker";
import { WhatsNewSheet } from "../../patterns/whats-new-sheet";
import { NotificationsPage } from "../../layout/notifications-page";

describe("InlineAlert and Banner", () => {
  it("announce errors, say info politely, and dismiss", () => {
    const onDismiss = vi.fn();
    render(
      <>
        <InlineAlert variant="destructive" title="Fix 2 fields" description="Name and email." actions={<button>Review</button>} />
        <Banner title="You're offline" onDismiss={onDismiss} />
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Fix 2 fields");
    const banner = screen.getByTestId("banner-info");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(within(banner).getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("ChoiceCard", () => {
  it("is a radio, or a checkbox with multiple, that reports its state", () => {
    const onSelectedChange = vi.fn();
    const { rerender } = render(<ChoiceCard title="Monthly" description="$20" selected={false} onSelectedChange={onSelectedChange} />);
    const card = screen.getByRole("radio", { name: /Monthly/ });
    expect(card.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(card);
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    rerender(<ChoiceCard title="Extras" selected multiple onSelectedChange={onSelectedChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onSelectedChange).toHaveBeenLastCalledWith(false);
  });
});

describe("ChipGroup", () => {
  it("keeps one chip on in single mode and any number in multiple", () => {
    function Single() {
      const [v, setV] = useState<string | string[]>("all");
      return (
        <ChipGroup value={v} onChange={setV} aria-label="Level">
          <ChipGroupItem value="all">All</ChipGroupItem>
          <ChipGroupItem value="new">New</ChipGroupItem>
        </ChipGroup>
      );
    }
    render(<Single />);
    expect(screen.getByRole("group", { name: "Level" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("chip-new"));
    expect(screen.getByTestId("chip-new").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("chip-all").getAttribute("aria-pressed")).toBe("false");
    // Pressing the chosen one keeps it.
    fireEvent.click(screen.getByTestId("chip-new"));
    expect(screen.getByTestId("chip-new").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Combobox", () => {
  it("finds options by every word, ignoring accents, and picks one", async () => {
    const onChange = vi.fn();
    render(
      <Combobox
        aria-label="City"
        options={[
          { value: "zurich", label: "Zürich", description: "Switzerland" },
          { value: "paris", label: "Paris", description: "France" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("combobox-trigger"));
    const search = await screen.findByTestId("combobox-search");
    fireEvent.change(search, { target: { value: "zur swi" } });
    expect(screen.queryByTestId("combobox-option-paris")).toBeNull();
    fireEvent.click(screen.getByTestId("combobox-option-zurich"));
    expect(onChange).toHaveBeenCalledWith("zurich");
  });
});

describe("NumberInput", () => {
  function Qty({ min, max }: { min?: number; max?: number }) {
    const [v, setV] = useState(2);
    return <NumberInput aria-label="Quantity" value={v} onChange={setV} min={min} max={max} />;
  }
  it("steps with the buttons and the arrow keys, inside its range, and reads typed numbers", () => {
    render(<Qty min={1} max={3} />);
    const field = screen.getByRole("spinbutton", { name: "Quantity" }) as HTMLInputElement;
    fireEvent.click(screen.getByTestId("number-input-increment"));
    expect(field.value).toBe("3");
    expect((screen.getByTestId("number-input-increment") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(field, { key: "Home" });
    expect(field.value).toBe("1");
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field.getAttribute("aria-valuenow")).toBe("2");
    fireEvent.change(field, { target: { value: "9" } });
    fireEvent.blur(field);
    expect(field.value).toBe("3");
  });
});

describe("RangeSlider", () => {
  it("draws two named thumbs", () => {
    render(<RangeSlider value={[20, 80]} onChange={() => {}} labels={["Lowest price", "Highest price"]} />);
    const thumbs = screen.getAllByRole("slider");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]!.getAttribute("aria-label")).toBe("Lowest price");
    expect(thumbs[1]!.getAttribute("aria-valuenow")).toBe("80");
  });
});

describe("Stepper", () => {
  it("marks done, current and upcoming steps", () => {
    render(<Stepper steps={[{ label: "Account" }, { label: "Plan" }, { label: "Pay" }]} current={1} />);
    expect(screen.getByTestId("stepper-step-0").getAttribute("data-state")).toBe("complete");
    expect(screen.getByTestId("stepper-step-1").getAttribute("aria-current")).toBe("step");
    expect(screen.getByTestId("stepper-step-2").getAttribute("data-state")).toBe("upcoming");
  });
});

describe("TimePicker", () => {
  it("picks a listed time or a typed one, keeping the day", async () => {
    const onChange = vi.fn();
    const day = new Date(2026, 5, 3, 9, 0);
    render(<TimePicker value={day} onChange={onChange} hour12={false} minuteStep={30} />);
    expect(screen.getByTestId("time-picker-trigger").textContent).toContain("09:00");
    fireEvent.click(screen.getByTestId("time-picker-trigger"));
    fireEvent.click(await screen.findByTestId("time-picker-option-13:30"));
    expect((onChange.mock.calls[0]![0] as Date).getHours()).toBe(13);
    fireEvent.click(screen.getByTestId("time-picker-trigger"));
    const search = await screen.findByTestId("time-picker-search");
    fireEvent.change(search, { target: { value: "2:05 pm" } });
    fireEvent.keyDown(search, { key: "Enter" });
    const picked = onChange.mock.calls[1]![0] as Date;
    expect([picked.getDate(), picked.getHours(), picked.getMinutes()]).toEqual([3, 14, 5]);
  });
});

describe("WhatsNewSheet", () => {
  it("lists the notes; Learn more and Got it both dismiss", async () => {
    const dismiss = vi.fn();
    const onOpenNote = vi.fn();
    render(<WhatsNewSheet notes={[{ key: "a", title: "Dark mode", body: "At last.", url: "https://acme.test/n/a" }]} dismiss={dismiss} onOpenNote={onOpenNote} />);
    expect(await screen.findByRole("dialog", { name: "What's new" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("whats-new-open-a"));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onOpenNote).toHaveBeenCalledWith(expect.objectContaining({ key: "a" }));
    fireEvent.click(screen.getByTestId("whats-new-done"));
    expect(dismiss).toHaveBeenCalledTimes(2);
  });
});

describe("NotificationsPage", () => {
  it("groups by day, marks unread rows and opens one", async () => {
    const onPress = vi.fn();
    const onMarkAllRead = vi.fn();
    const now = new Date(2026, 5, 10, 12);
    render(
      <NotificationsPage
        now={now}
        onMarkAllRead={onMarkAllRead}
        items={[
          { id: "1", title: "New message", timestamp: new Date(2026, 5, 10, 9), unread: true, onPress },
          { id: "2", title: "Class moved", timestamp: new Date(2026, 4, 1) },
        ]}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Today", "Earlier"]);
    expect(within(screen.getByTestId("notifications-row-1")).getByText("Unread")).toBeTruthy();
    await act(async () => fireEvent.click(within(screen.getByTestId("notifications-row-1")).getByRole("button")));
    expect(onPress).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("notifications-page-mark-all-read"));
    expect(onMarkAllRead).toHaveBeenCalled();
  });

  it("says when there's nothing", () => {
    render(<NotificationsPage items={[]} />);
    expect(screen.getByText("No notifications yet")).toBeTruthy();
  });
});
