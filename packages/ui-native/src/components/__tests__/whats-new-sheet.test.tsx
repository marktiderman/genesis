import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeWhatsNewSheet } from "../whats-new-sheet";

describe("NativeWhatsNewSheet", () => {
  it("lists the notes and closes with Got it", () => {
    const dismiss = vi.fn();
    render(<NativeWhatsNewSheet notes={[{ key: "1.2.0", title: "Faster sync", body: "Lists load sooner." }]} dismiss={dismiss} />);
    expect(screen.getByText("What's new")).toBeTruthy();
    expect(screen.getByTestId("native-whats-new-1.2.0").textContent).toContain("Lists load sooner.");
    fireEvent.click(screen.getByTestId("native-whats-new-done"));
    expect(dismiss).toHaveBeenCalled();
  });

  it("Learn more closes, then opens the note", () => {
    const calls: string[] = [];
    render(
      <NativeWhatsNewSheet
        notes={[{ key: "n1", title: "Boards", url: "/boards" }, { key: "n2", title: "No link" }]}
        dismiss={() => calls.push("dismiss")}
        onOpenNote={(note) => calls.push(`open ${note.url}`)}
        learnMoreLabel="More"
      />,
    );
    expect(screen.queryByTestId("native-whats-new-open-n2")).toBeNull();
    fireEvent.click(screen.getByTestId("native-whats-new-open-n1"));
    expect(calls).toEqual(["dismiss", "open /boards"]);
  });
});
