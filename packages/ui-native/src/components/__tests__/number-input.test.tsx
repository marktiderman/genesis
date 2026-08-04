import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeNumberInput } from "../number-input";

function Wrapper(props: { initial?: number; min?: number; max?: number; step?: number }) {
  const [v, setV] = useState(props.initial ?? 1);
  return (
    <NativeNumberInput
      testID="qty"
      value={v}
      onChange={setV}
      min={props.min}
      max={props.max}
      step={props.step}
    />
  );
}

describe("NativeNumberInput", () => {
  it("increments on + press", () => {
    render(<Wrapper initial={2} />);
    fireEvent.click(screen.getByTestId("qty-increment"));
    expect((screen.getByTestId("qty-field") as HTMLInputElement).value).toBe("3");
  });

  it("decrements on − press", () => {
    render(<Wrapper initial={5} />);
    fireEvent.click(screen.getByTestId("qty-decrement"));
    expect((screen.getByTestId("qty-field") as HTMLInputElement).value).toBe("4");
  });

  it("clamps to min", () => {
    render(<Wrapper initial={1} min={1} />);
    fireEvent.click(screen.getByTestId("qty-decrement"));
    expect((screen.getByTestId("qty-field") as HTMLInputElement).value).toBe("1");
    expect(screen.getByTestId("qty-decrement").getAttribute("aria-disabled")).toBe("true");
  });

  it("clamps to max", () => {
    render(<Wrapper initial={5} max={5} />);
    fireEvent.click(screen.getByTestId("qty-increment"));
    expect((screen.getByTestId("qty-field") as HTMLInputElement).value).toBe("5");
    expect(screen.getByTestId("qty-increment").getAttribute("aria-disabled")).toBe("true");
  });
});
