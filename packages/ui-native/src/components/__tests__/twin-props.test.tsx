/**
 * The native twins take the web twins' props: NativeChipGroup's `mode` union and `allowEmpty`,
 * NativeChoiceCard's `value` in a NativeRadioGroup and `multiple` with `onSelectedChange`, and
 * NotificationsPage's `timeZone`.
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeChip, NativeChipGroup } from "../chip-group";
import { NativeChoiceCard } from "../choice-card";
import { NativeRadioGroup } from "../radio-group";
import { NotificationsPage } from "../../layouts/notifications-page";

describe("NativeChipGroup, as the web's ChipGroup", () => {
  it("in single mode gives one string, reports the chosen chip pressed again as before, and clears it with allowEmpty", () => {
    const onChange = vi.fn<(value: string) => void>();
    const { rerender } = render(
      <NativeChipGroup mode="single" value="all" onChange={onChange}>
        <NativeChip value="all">All</NativeChip>
        <NativeChip value="new">New</NativeChip>
      </NativeChipGroup>,
    );
    // As on main: the chosen chip pressed again still calls onChange with its value.
    fireEvent.click(screen.getByTestId("chip-all"));
    expect(onChange).toHaveBeenLastCalledWith("all");
    fireEvent.click(screen.getByTestId("chip-new"));
    expect(onChange).toHaveBeenLastCalledWith("new");
    rerender(
      <NativeChipGroup mode="single" value="all" onChange={onChange} allowEmpty>
        <NativeChip value="all">All</NativeChip>
        <NativeChip value="new">New</NativeChip>
      </NativeChipGroup>,
    );
    fireEvent.click(screen.getByTestId("chip-all"));
    expect(onChange).toHaveBeenLastCalledWith("");
  });
  it("in multiple mode gives a list", () => {
    const onChange = vi.fn<(value: string[]) => void>();
    render(
      <NativeChipGroup mode="multiple" value={["mon"]} onChange={onChange}>
        <NativeChip value="mon">Mon</NativeChip>
        <NativeChip value="tue">Tue</NativeChip>
      </NativeChipGroup>,
    );
    fireEvent.click(screen.getByTestId("chip-tue"));
    expect(onChange).toHaveBeenLastCalledWith(["mon", "tue"]);
  });
});

describe("NativeChoiceCard, as the web's ChoiceCard", () => {
  it("is chosen by its value in a NativeRadioGroup", () => {
    function Plans({ onValueChange }: { onValueChange: (v: string) => void }) {
      const [plan, setPlan] = useState("monthly");
      return (
        <NativeRadioGroup
          value={plan}
          onValueChange={(v) => {
            setPlan(v);
            onValueChange(v);
          }}
        >
          <NativeChoiceCard value="monthly" title="Monthly" testID="card-monthly" />
          <NativeChoiceCard value="yearly" title="Yearly" testID="card-yearly" />
        </NativeRadioGroup>
      );
    }
    const onValueChange = vi.fn();
    render(<Plans onValueChange={onValueChange} />);
    expect(screen.getByTestId("card-monthly").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByTestId("card-yearly"));
    expect(onValueChange).toHaveBeenLastCalledWith("yearly");
    expect(screen.getByTestId("card-yearly").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("card-yearly").getAttribute("role")).toBe("radio");
  });
  it("with multiple is a checkbox that reports its next state", () => {
    const onSelectedChange = vi.fn();
    render(<NativeChoiceCard multiple selected title="Extras" onSelectedChange={onSelectedChange} />);
    fireEvent.click(screen.getByTestId("native-choice-card"));
    expect(onSelectedChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId("native-choice-card").getAttribute("role")).toBe("checkbox");
  });
  it("still takes selected with onPress", () => {
    const onPress = vi.fn();
    render(<NativeChoiceCard selected={false} title="Monthly" onPress={onPress} />);
    fireEvent.click(screen.getByTestId("native-choice-card"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it("says what's wrong when a value has no group", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<NativeChoiceCard value="x" title="Lost" />)).toThrow(/NativeRadioGroup/);
  });
});

describe("NotificationsPage's timeZone", () => {
  it("counts days on the zone given, as the web's does, not the device's", () => {
    const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
    const before = env.TZ;
    env.TZ = "UTC";
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-06-11T01:00:00Z") });
    try {
      // 14:00 UTC on 10 June: yesterday on a UTC device, but today in Pago Pago (UTC-11), where it is still 10 June.
      const items = [{ id: "1", title: "Booked", timestamp: "2026-06-10T14:00:00Z" }];
      const { unmount } = render(<NotificationsPage items={items} />);
      expect(screen.getByText("Yesterday")).toBeTruthy();
      unmount();
      render(<NotificationsPage items={items} timeZone="Pacific/Pago_Pago" />);
      expect(screen.getByText("Today")).toBeTruthy();
    } finally {
      vi.useRealTimers();
      if (before === undefined) delete env.TZ;
      else env.TZ = before;
    }
  });
});
