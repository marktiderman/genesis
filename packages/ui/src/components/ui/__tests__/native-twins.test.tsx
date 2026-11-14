/**
 * The web twins of genesis-ui-native components: Banner, InlineAlert, ChoiceCard, ChipGroup,
 * Combobox, NumberInput, RangeSlider, Stepper, TimePicker, WhatsNewSheet and NotificationsPage.
 * Each takes the native twin's props and keeps its behaviour in genesis-core.
 */
import { createRef, useState } from "react";
import { renderToString } from "react-dom/server";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Banner, InlineAlert } from "../inline-alert";
import { ChoiceCard } from "../choice-card";
import { RadioGroup } from "../radio-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../input-otp";
import { OTP_PATTERN_DIGITS } from "@marktiderman/genesis-core/headless";
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
  it("titles a warning with a token, not a literal colour", () => {
    render(<InlineAlert variant="warning" title="Almost full" />);
    const title = screen.getByText("Almost full");
    expect(title.className).toContain("text-foreground");
    expect(title.className).not.toMatch(/amber/);
  });
});

describe("ChoiceCard", () => {
  function Plans({ onValueChange }: { onValueChange?: (v: string) => void }) {
    const [plan, setPlan] = useState("monthly");
    return (
      <RadioGroup
        aria-label="Plan"
        value={plan}
        onValueChange={(v) => {
          setPlan(v);
          onValueChange?.(v);
        }}
      >
        <ChoiceCard value="monthly" title="Monthly" description="$20" testID="card-monthly" />
        <ChoiceCard value="yearly" title="Yearly" description="$200" testID="card-yearly" />
        <ChoiceCard value="lifetime" title="Lifetime" testID="card-lifetime" />
      </RadioGroup>
    );
  }
  it("is a radio in the RadioGroup: one tab stop, and the arrow keys move the choice", async () => {
    const onValueChange = vi.fn();
    render(<Plans onValueChange={onValueChange} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    // Roving focus: the group is the one tab stop, and tabbing in lands on the chosen card.
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "-1", "-1"]);
    act(() => screen.getByRole("radiogroup", { name: "Plan" }).focus());
    expect(document.activeElement?.getAttribute("data-testid")).toBe("card-monthly");
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    fireEvent.keyDown(radios[0]!, { key: "ArrowDown" });
    // Radix moves the focus on the next tick.
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(document.activeElement).toBe(radios[1]);
    expect(onValueChange).toHaveBeenLastCalledWith("yearly");
    expect(screen.getByTestId("card-yearly").getAttribute("data-state")).toBe("checked");
    fireEvent.click(screen.getByRole("radio", { name: /Lifetime/ }));
    expect(onValueChange).toHaveBeenLastCalledWith("lifetime");
  });
  it("is a checkbox with multiple, that reports its state", () => {
    const onSelectedChange = vi.fn();
    render(<ChoiceCard title="Extras" selected multiple onSelectedChange={onSelectedChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onSelectedChange).toHaveBeenLastCalledWith(false);
  });
});

describe("ChipGroup", () => {
  it("keeps one chip on in single mode and any number in multiple", () => {
    function Single() {
      const [v, setV] = useState("all");
      return (
        <ChipGroup mode="single" value={v} onChange={setV} aria-label="Level">
          <ChipGroupItem value="all">All</ChipGroupItem>
          <ChipGroupItem value="new">New</ChipGroupItem>
        </ChipGroup>
      );
    }
    render(<Single />);
    // Single mode is a radio group, as Radix's single ToggleGroup is.
    expect(screen.getByRole("radiogroup", { name: "Level" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("chip-new"));
    expect(screen.getByTestId("chip-new").getAttribute("data-state")).toBe("on");
    expect(screen.getByTestId("chip-all").getAttribute("data-state")).toBe("off");
    // Pressing the chosen one keeps it.
    fireEvent.click(screen.getByTestId("chip-new"));
    expect(screen.getByTestId("chip-new").getAttribute("data-state")).toBe("on");
  });
  it("is the ToggleGroup: one tab stop and arrow keys; multiple is the default and gets a list", async () => {
    const onChange = vi.fn<(value: string[]) => void>();
    render(
      <ChipGroup value={["mon"]} onChange={onChange} aria-label="Days">
        <ChipGroupItem value="mon">Mon</ChipGroupItem>
        <ChipGroupItem value="tue">Tue</ChipGroupItem>
      </ChipGroup>,
    );
    const mon = screen.getByTestId("chip-mon");
    const tue = screen.getByTestId("chip-tue");
    expect(mon.getAttribute("aria-pressed")).toBe("true");
    // The group is the one tab stop; tabbing in lands on the chip that is on.
    expect([mon.tabIndex, tue.tabIndex]).toEqual([-1, -1]);
    // Radix's multiple ToggleGroup is a toolbar.
    act(() => screen.getByRole("toolbar", { name: "Days" }).focus());
    expect(document.activeElement).toBe(mon);
    expect([mon.tabIndex, tue.tabIndex]).toEqual([0, -1]);
    fireEvent.keyDown(mon, { key: "ArrowRight" });
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(document.activeElement).toBe(tue);
    fireEvent.click(tue);
    expect(onChange).toHaveBeenLastCalledWith(["mon", "tue"]);
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
  it("reads a thousands comma as a group, not a decimal mark", () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="Price" value={0} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1,234" } });
    expect(onChange).toHaveBeenLastCalledWith(1234);
  });
  it("passes a typed number on only while in range, clamps once when left, and works in a form", () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const ref = createRef<HTMLInputElement>();
    render(<NumberInput ref={ref} name="spots" aria-label="Spots" value={12} onChange={onChange} onBlur={onBlur} min={10} max={20} />);
    const field = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(ref.current).toBe(field);
    expect(field.name).toBe("spots");
    // "1" on the way to "15": below min, so nothing is sent.
    fireEvent.change(field, { target: { value: "1" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "15" } });
    expect(onChange).toHaveBeenLastCalledWith(15);
    onChange.mockClear();
    fireEvent.change(field, { target: { value: "5" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(10);
    fireEvent.blur(field);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("NumberInput rounding and drafts", () => {
  it("rounds a typed number to the precision when it is left, so the value is what the field shows", () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="Seats" value={0} onChange={onChange} precision={0} />);
    const field = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "1.5" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(onChange.mock.calls).toEqual([[2]]);
  });
  it("doesn't send 1.2 and 1.23 while \"1,234\" is typed key by key", () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="Price" value={0} onChange={onChange} />);
    const field = screen.getByRole("spinbutton");
    for (const t of ["1", "1,", "1,2", "1,23", "1,234"]) fireEvent.change(field, { target: { value: t } });
    const sent = onChange.mock.calls.map((c) => c[0] as number);
    expect(sent).not.toContain(1.2);
    expect(sent).not.toContain(1.23);
    expect(sent.at(-1)).toBe(1234);
  });
  it("doesn't read \"1,5\" as 15 in an en-US field", () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="Price" value={3} onChange={onChange} locale="en-US" />);
    const field = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "1,5" } });
    fireEvent.blur(field);
    expect(onChange).not.toHaveBeenCalled();
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
  it("highlights the typed time first, and Enter picks what is highlighted, after arrows too", async () => {
    const onChange = vi.fn();
    render(<TimePicker value="09:00" onChange={onChange} hour12={false} minuteStep={30} />);
    fireEvent.click(screen.getByTestId("time-picker-trigger"));
    const search = await screen.findByTestId("time-picker-search");
    fireEvent.change(search, { target: { value: "14" } });
    await act(async () => {});
    const highlighted = () => document.querySelector("[cmdk-item][data-selected='true']")?.getAttribute("data-value");
    expect(highlighted()).toBe("14:00");
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("14:00");

    fireEvent.click(screen.getByTestId("time-picker-trigger"));
    const again = await screen.findByTestId("time-picker-search");
    fireEvent.change(again, { target: { value: "14" } });
    await act(async () => {});
    fireEvent.keyDown(again, { key: "ArrowDown" });
    const next = highlighted();
    expect(next).not.toBe("14:00");
    fireEvent.keyDown(again, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(next);
  });
  it("takes and gives an HH:MM string, as <input type=time> holds it", async () => {
    const onChange = vi.fn<(next: string) => void>();
    const { rerender } = render(<TimePicker value="" onChange={onChange} hour12 />);
    expect(screen.getByTestId("time-picker-trigger").textContent).toContain("Pick a time");
    rerender(<TimePicker value="13:30" onChange={onChange} hour12 />);
    expect(screen.getByTestId("time-picker-trigger").textContent).toContain("1:30 PM");
    fireEvent.click(screen.getByTestId("time-picker-trigger"));
    fireEvent.click(await screen.findByTestId("time-picker-option-08:15"));
    expect(onChange).toHaveBeenLastCalledWith("08:15");
  });
  it("renders the same 24-hour time on the server whatever its locale, until it hydrates", () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ hour12: true } as Intl.ResolvedDateTimeFormatOptions);
    try {
      expect(renderToString(<TimePicker value="14:30" onChange={() => {}} />)).toContain("14:30");
      render(<TimePicker value="14:30" onChange={() => {}} />);
      expect(screen.getByTestId("time-picker-trigger").textContent).toContain("2:30 PM");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("TimePicker's zone and name", () => {
  const withTZ = <T,>(zone: string, run: () => T): T => {
    const before = process.env.TZ;
    process.env.TZ = zone;
    try {
      return run();
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  };
  const at = new Date("2026-06-10T18:30:00Z");

  it("renders no Date time on the server without a timeZone, so servers in any zone agree", () => {
    const html = (zone: string) => withTZ(zone, () => renderToString(<TimePicker value={at} onChange={() => {}} hour12={false} />));
    const utc = html("UTC");
    expect(utc).toBe(html("Asia/Tokyo"));
    expect(utc).not.toContain("18:30");
    expect(utc).not.toContain("03:30");
  });

  it("renders and picks a Date's time on the timeZone given, whatever the machine's zone", () => {
    for (const zone of ["UTC", "America/New_York"]) {
      expect(withTZ(zone, () => renderToString(<TimePicker value={at} onChange={() => {}} hour12={false} timeZone="Asia/Tokyo" />))).toContain("03:30");
    }
    const onChange = vi.fn<(next: Date) => void>();
    withTZ("UTC", () => {
      render(<TimePicker value={at} onChange={onChange} hour12={false} timeZone="Asia/Tokyo" />);
      expect(screen.getByTestId("time-picker-trigger").textContent).toContain("03:30");
      fireEvent.click(screen.getByTestId("time-picker-trigger"));
      fireEvent.click(screen.getByTestId("time-picker-option-08:15"));
    });
    // 08:15 in Tokyo on the same Tokyo day (11 June) is 23:15 on 10 June in UTC.
    expect(onChange.mock.calls[0]![0].toISOString()).toBe("2026-06-10T23:15:00.000Z");
  });

  // Picks through the real component, on a UTC machine, in a zone with daylight saving.
  const pickIn = (zone: string, value: string, option: string) => {
    const onChange = vi.fn<(next: Date) => void>();
    withTZ("UTC", () => {
      const { unmount } = render(<TimePicker value={new Date(value)} onChange={onChange} hour12={false} minuteStep={15} timeZone={zone} />);
      fireEvent.click(screen.getByTestId("time-picker-trigger"));
      const search = screen.getByTestId("time-picker-search");
      fireEvent.change(search, { target: { value: option } });
      fireEvent.click(screen.getByTestId(screen.queryByTestId(`time-picker-option-${option}`) ? `time-picker-option-${option}` : "time-picker-typed"));
      unmount();
    });
    return onChange.mock.calls[0]![0].toISOString();
  };

  it.each([
    // Spring forward in New York (8 March 2026, 02:00 skipped): from 00:10 EST to 23:45 EDT, same day.
    ["America/New_York", "2026-03-08T05:10:00Z", "23:45", "2026-03-09T03:45:00.000Z"],
    // From 23:00 EDT back to 00:15 EST, same day.
    ["America/New_York", "2026-03-09T03:00:00Z", "00:15", "2026-03-08T05:15:00.000Z"],
    // London's spring change (29 March 2026): from 00:30 GMT to 23:45 BST.
    ["Europe/London", "2026-03-29T00:30:00Z", "23:45", "2026-03-29T22:45:00.000Z"],
    // Fall back in New York (1 November 2026, 01:00-02:00 twice): from 00:30 EDT.
    ["America/New_York", "2026-11-01T04:30:00Z", "23:30", "2026-11-02T04:30:00.000Z"],
    ["America/New_York", "2026-11-01T04:30:00Z", "03:00", "2026-11-01T08:00:00.000Z"],
    // A repeated time is the first of the two (EDT).
    ["America/New_York", "2026-11-01T04:30:00Z", "01:30", "2026-11-01T05:30:00.000Z"],
    // A skipped time moves forward by the gap: 02:30 is 03:30 EDT.
    ["America/New_York", "2026-03-08T05:10:00Z", "02:30", "2026-03-08T07:30:00.000Z"],
    ["Europe/London", "2026-03-29T00:30:00Z", "01:30", "2026-03-29T01:30:00.000Z"],
  ])("in %s, from %s, picking %s gives %s (the same day on that clock)", (zone, value, option, expected) => {
    expect(pickIn(zone, value, option)).toBe(expected);
  });

  it("is named once by a label that wraps it: the time isn't said twice", () => {
    render(
      <label>
        Starts <TimePicker value="14:30" onChange={() => {}} hour12={false} />
      </label>,
    );
    const trigger = screen.getByTestId("time-picker-trigger");
    expect(trigger.hasAttribute("aria-label")).toBe(false);
    // The label's words (its own copy of the trigger is skipped as the control it names), then the time once.
    expect(screen.getByRole("button", { name: "Starts 14:30" })).toBe(trigger);
    expect(trigger.textContent?.match(/14:30/g)).toHaveLength(1);
  });

  it("finds a label that mounts after the picker", () => {
    function Late({ show }: { show: boolean }) {
      return (
        <>
          {show ? <label htmlFor="late">Ends</label> : null}
          <TimePicker id="late" value="16:00" onChange={() => {}} hour12={false} />
        </>
      );
    }
    const { rerender } = render(<Late show={false} />);
    expect(screen.getByRole("button", { name: "Pick a time, 16:00" })).toBeTruthy();
    rerender(<Late show />);
    expect(screen.getByRole("button", { name: "Ends 16:00" })).toBeTruthy();
  });

  it("is named by its visible label and the time, not an aria-label over them", async () => {
    render(
      <>
        <label htmlFor="starts">Starts</label>
        <TimePicker id="starts" value="14:30" onChange={() => {}} hour12={false} />
      </>,
    );
    const trigger = screen.getByTestId("time-picker-trigger");
    expect(trigger.hasAttribute("aria-label")).toBe(false);
    expect(screen.getByRole("button", { name: "Starts 14:30" })).toBe(trigger);
  });

  it("takes aria-label or aria-labelledby, and says only 'Pick a time' with neither and no label", () => {
    const { unmount } = render(<TimePicker aria-label="Starts" value="14:30" onChange={() => {}} hour12={false} />);
    expect(screen.getByRole("button", { name: "Starts, 14:30" })).toBeTruthy();
    unmount();
    const second = render(
      <>
        <span id="ends-word">Ends</span>
        <TimePicker aria-labelledby="ends-word" value="16:00" onChange={() => {}} hour12={false} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Ends 16:00" })).toBeTruthy();
    second.unmount();
    render(<TimePicker value="" onChange={() => {}} hour12={false} />);
    expect(screen.getByRole("button", { name: "Pick a time" })).toBeTruthy();
  });
});

describe("InputOTP", () => {
  it("strips the separators of a pasted code, as the phone's does", () => {
    const onChange = vi.fn();
    render(
      <InputOTP maxLength={6} onChange={onChange} pattern={OTP_PATTERN_DIGITS} data-testid="otp">
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>,
    );
    const input = screen.getByTestId("otp");
    act(() => input.focus());
    fireEvent.paste(input, { clipboardData: { getData: () => "123-456" } });
    expect(onChange).toHaveBeenLastCalledWith("123456");
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

  it("puts a later day under Upcoming", () => {
    const now = new Date(2026, 5, 10, 12);
    render(
      <NotificationsPage
        now={now}
        items={[
          { id: "1", title: "Today's", timestamp: new Date(2026, 5, 10, 9) },
          { id: "2", title: "Tomorrow's class", timestamp: new Date(2026, 5, 11, 9) },
        ]}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Upcoming", "Today"]);
  });

  it("leaves the day headings to the browser when the server has no clock and zone to count from", () => {
    const items = [{ id: "1", title: "New message", timestamp: new Date() }];
    const server = renderToString(<NotificationsPage items={items} />);
    expect(server).toContain("New message");
    expect(server).not.toContain("<h2");
    // Given both, the server groups too.
    const zoned = renderToString(<NotificationsPage items={[{ id: "1", title: "New message", timestamp: "2026-06-10T23:30:00Z" }]} now={new Date("2026-06-11T01:00:00Z")} timeZone="Asia/Tokyo" />);
    expect(zoned).toContain(">Today</h2>");
  });

  it("says when there's nothing", () => {
    render(<NotificationsPage items={[]} />);
    expect(screen.getByText("No notifications yet")).toBeTruthy();
  });
});
