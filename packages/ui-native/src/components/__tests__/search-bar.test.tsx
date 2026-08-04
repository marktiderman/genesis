import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeSearchBar } from "../search-bar";

function Wrapper(props: { onSubmit?: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <NativeSearchBar
      testID="s"
      value={v}
      onChange={setV}
      onSubmit={props.onSubmit}
    />
  );
}

describe("NativeSearchBar", () => {
  it("clears value on the clear button press", () => {
    const Init = () => {
      const [v, setV] = useState("hello");
      return <NativeSearchBar testID="s" value={v} onChange={setV} />;
    };
    render(<Init />);
    expect((screen.getByTestId("s-input") as HTMLInputElement).value).toBe(
      "hello"
    );
    fireEvent.click(screen.getByTestId("s-clear"));
    expect((screen.getByTestId("s-input") as HTMLInputElement).value).toBe("");
  });

  it("fires onSubmit on Enter", () => {
    const onSubmit = vi.fn();
    render(<Wrapper onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId("s-input"), {
      target: { value: "query" },
    });
    fireEvent.keyDown(screen.getByTestId("s-input"), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("query");
  });
});
