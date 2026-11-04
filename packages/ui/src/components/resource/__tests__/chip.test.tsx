// @feat:resource-workspace
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Chip } from "..";

describe("Chip", () => {
  it("is a plain status chip without onSelectedChange", () => {
    render(<Chip tone="success" testID="c">Live</Chip>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("c").textContent).toBe("Live");
  });

  it("is a toggle button with aria-pressed when pressable", () => {
    function Demo() {
      const [on, setOn] = useState(false);
      return (
        <Chip tone="info" selected={on} onSelectedChange={setOn}>
          Open
        </Chip>
      );
    }
    render(<Demo />);
    const chip = screen.getByRole("button", { name: "Open" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("false");
  });

  it("is a native button, so Enter and Space press it, and disabled stops it", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Chip tone="muted" selected onSelectedChange={onChange}>
        Mine
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "Mine" });
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.getAttribute("type")).toBe("button");
    fireEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(false);
    rerender(
      <Chip tone="muted" selected onSelectedChange={onChange} disabled>
        Mine
      </Chip>,
    );
    expect((screen.getByRole("button", { name: "Mine" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
