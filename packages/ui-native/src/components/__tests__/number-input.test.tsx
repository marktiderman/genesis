import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pressable, Text } from "react-native";
import { NativeNumberInput } from "../number-input";
import { FormPage } from "../../layouts/pages";

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

  it("clearing the field keeps the value and shows it again on leaving, so the field never shows a number it doesn't hold", () => {
    const onChange = vi.fn();
    render(<NativeNumberInput testID="qty" value={7} onChange={onChange} />);
    const field = screen.getByTestId("qty-field") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "" } });
    expect(field.value).toBe("");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(field.value).toBe("7");
  });

  it("keeps a half-typed number while typing, and commits each whole one", () => {
    const onChange = vi.fn();
    render(<NativeNumberInput testID="qty" value={1} onChange={onChange} precision={1} />);
    const field = screen.getByTestId("qty-field") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "-" } });
    expect(field.value).toBe("-");
    fireEvent.change(field, { target: { value: "-2" } });
    expect(onChange).toHaveBeenLastCalledWith(-2);
  });

  it("passes on a typed number only while it is in range, and clamps when the field is left", () => {
    const onChange = vi.fn();
    render(<NativeNumberInput testID="qty" value={12} onChange={onChange} min={10} max={20} />);
    const field = screen.getByTestId("qty-field") as HTMLInputElement;
    // "1" on the way to "15": below min, so nothing is sent yet.
    fireEvent.change(field, { target: { value: "1" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "15" } });
    expect(onChange).toHaveBeenLastCalledWith(15);
    // Out of range, then left: clamped once, on blur.
    onChange.mockClear();
    fireEvent.change(field, { target: { value: "99" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(20);
  });

  it("reads a thousands comma as a group, or the locale's own marks", () => {
    const onChange = vi.fn();
    const { rerender } = render(<NativeNumberInput testID="qty" value={0} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("qty-field"), { target: { value: "1,234" } });
    expect(onChange).toHaveBeenLastCalledWith(1234);
    rerender(<NativeNumberInput testID="qty" value={0} onChange={onChange} locale="de-DE" />);
    fireEvent.change(screen.getByTestId("qty-field"), { target: { value: "1.234" } });
    expect(onChange).toHaveBeenLastCalledWith(1234);
  });

  it("rounds a typed number to the precision when it commits, so the value is what the field shows", () => {
    const onChange = vi.fn();
    render(<NativeNumberInput testID="qty" value={0} onChange={onChange} precision={0} />);
    const field = screen.getByTestId("qty-field") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "1.5" } });
    // Past the precision: held until the edit ends.
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("doesn't send 1.2 and 1.23 while \"1,234\" is typed key by key", () => {
    const onChange = vi.fn();
    render(<NativeNumberInput testID="qty" value={0} onChange={onChange} />);
    const field = screen.getByTestId("qty-field");
    for (const t of ["1", "1,", "1,2", "1,23", "1,234"]) fireEvent.change(field, { target: { value: t } });
    const sent = onChange.mock.calls.map((c) => c[0] as number);
    expect(sent).not.toContain(1.2);
    expect(sent).not.toContain(1.23);
    expect(sent.at(-1)).toBe(1234);
  });

  it("commits once when the edit ends, though blur and end-editing both fire", () => {
    const onChange = vi.fn();
    render(<NativeNumberInput testID="qty" value={12} onChange={onChange} min={10} max={20} />);
    const field = screen.getByTestId("qty-field");
    fireEvent.change(field, { target: { value: "5" } });
    fireEvent.blur(field);
    expect(onChange.mock.calls).toEqual([[10]]);
  });

  it("commits an out-of-range draft when FormPage's Save is touched, before Save runs", () => {
    const seen: number[] = [];
    function Form() {
      const [spots, setSpots] = useState(12);
      return (
        <FormPage
          title="Class"
          actions={
            <Pressable testID="save" onPress={() => seen.push(spots)}>
              <Text>Save</Text>
            </Pressable>
          }
        >
          <NativeNumberInput testID="qty" value={spots} onChange={setSpots} min={10} max={20} />
        </FormPage>
      );
    }
    render(<Form />);
    const field = screen.getByTestId("qty-field") as HTMLInputElement;
    field.focus();
    fireEvent.change(field, { target: { value: "5" } });
    // The touch starts (the keyboard is dismissed, the field commits), then the press ends.
    fireEvent.pointerDown(screen.getByTestId("save"));
    fireEvent.click(screen.getByTestId("save"));
    expect(seen).toEqual([10]);
    expect(field.value).toBe("10");
  });
});
