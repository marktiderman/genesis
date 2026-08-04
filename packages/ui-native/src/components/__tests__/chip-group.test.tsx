import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeChip, NativeChipGroup } from "../chip-group";

function Multiple() {
  const [v, setV] = useState<string | string[]>([]);
  return (
    <NativeChipGroup mode="multiple" value={v} onChange={setV}>
      <NativeChip value="a">A</NativeChip>
      <NativeChip value="b">B</NativeChip>
      <NativeChip value="c">C</NativeChip>
    </NativeChipGroup>
  );
}

function Single() {
  const [v, setV] = useState<string | string[]>("a");
  return (
    <NativeChipGroup mode="single" value={v} onChange={setV}>
      <NativeChip value="a">A</NativeChip>
      <NativeChip value="b">B</NativeChip>
    </NativeChipGroup>
  );
}

describe("NativeChipGroup", () => {
  it("toggles chip selection in multiple mode", () => {
    render(<Multiple />);
    const a = screen.getByTestId("chip-a");
    expect(a.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(a);
    expect(screen.getByTestId("chip-a").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByTestId("chip-a"));
    expect(screen.getByTestId("chip-a").getAttribute("aria-selected")).toBe("false");
  });

  it("single mode swaps the single selection", () => {
    render(<Single />);
    expect(screen.getByTestId("chip-a").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByTestId("chip-b"));
    expect(screen.getByTestId("chip-b").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("chip-a").getAttribute("aria-selected")).toBe("false");
  });
});
