import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createForm, defineForm, f, type FormEngine } from "@marktiderman/genesis-forms";
import { Form, SourceTextContext, MediaTimeContext } from "../index";

const structured = defineForm({
  id: "structured",
  title: "Structured",
  layout: { mode: "classic" },
  blocks: [
    f.list("goals", { label: "Keep doing", max: 3, itemPlaceholder: "One thing" }),
    f.table("plan", {
      label: "Plan",
      columns: [
        { key: "what", label: "What" },
        { key: "why", label: "Why", long: true },
      ],
      maxRows: 2,
    }),
    f.mediaNotes("moments", { label: "Moments" }),
    f.textHighlights("article", { label: "Article", text: "Team supports team, and one person supports another." }),
  ],
});

function renderForm(wrap?: (node: React.ReactNode) => React.ReactNode) {
  const engine: FormEngine = createForm(structured.definition);
  const node = <Form form={structured} engine={engine} />;
  render(wrap ? wrap(node) : node);
  return engine;
}

const value = (engine: FormEngine, id: string) => engine.getState().values[id];

describe("list renderer", () => {
  it("adds, edits and removes items, with named controls in a named group", () => {
    const engine = renderForm();
    const group = screen.getByRole("group", { name: "Keep doing" });
    const first = within(group).getByRole("textbox", { name: "Item 1" });
    expect(first.getAttribute("placeholder")).toBe("One thing");
    fireEvent.change(first, { target: { value: "Stretch" } });
    expect(value(engine, "goals")).toEqual(["Stretch"]);

    fireEvent.click(within(group).getByRole("button", { name: "Add item" }));
    const second = within(group).getByRole("textbox", { name: "Item 2" });
    expect(document.activeElement).toBe(second);
    fireEvent.change(second, { target: { value: "Sleep" } });
    expect(value(engine, "goals")).toEqual(["Stretch", "Sleep"]);

    fireEvent.click(within(group).getByRole("button", { name: "Remove item 1" }));
    expect(value(engine, "goals")).toEqual(["Sleep"]);
    expect(within(group).getByRole("textbox", { name: "Item 1" })).toHaveProperty("value", "Sleep");
  });

  it("starts a new item on Enter in the last one, up to the most allowed", () => {
    const engine = renderForm();
    const group = screen.getByRole("group", { name: "Keep doing" });
    const first = within(group).getByRole("textbox", { name: "Item 1" });
    fireEvent.change(first, { target: { value: "a" } });
    fireEvent.keyDown(first, { key: "Enter" });
    fireEvent.keyDown(within(group).getByRole("textbox", { name: "Item 2" }), { key: "Enter" });
    expect(within(group).getAllByRole("textbox")).toHaveLength(3);
    expect(within(group).getByRole("button", { name: "Add item" })).toHaveProperty("disabled", true);
    expect(value(engine, "goals")).toEqual(["a", "", ""]);
  });

  it("reorders items from the keyboard with SortableList", () => {
    const engine = renderForm();
    act(() => engine.setValue("goals", ["one", "two"]));
    const group = screen.getByRole("group", { name: "Keep doing" });
    fireEvent.keyDown(within(group).getByRole("button", { name: "Reorder two" }), { key: "ArrowUp", altKey: true });
    expect(value(engine, "goals")).toEqual(["two", "one"]);
  });
});

describe("table renderer", () => {
  it("labels every cell within a fieldset per row, and adds and removes rows", () => {
    const engine = renderForm();
    const group = screen.getByRole("group", { name: "Plan" });
    const row1 = within(group).getByRole("group", { name: "Row 1" });
    fireEvent.change(within(row1).getByRole("textbox", { name: "What" }), { target: { value: "Hi" } });
    fireEvent.change(within(row1).getByRole("textbox", { name: "Why" }), { target: { value: "Hello" } });
    expect(value(engine, "plan")).toEqual([{ what: "Hi", why: "Hello" }]);
    expect(within(row1).getByRole("textbox", { name: "Why" }).tagName).toBe("TEXTAREA");

    fireEvent.click(within(group).getByRole("button", { name: "Add row" }));
    expect(within(group).getByRole("group", { name: "Row 2" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Add row" })).toHaveProperty("disabled", true);
    fireEvent.click(within(group).getByRole("button", { name: "Remove row 1" }));
    expect(value(engine, "plan")).toEqual([{}]);
    expect(within(group).queryByRole("group", { name: "Row 2" })).toBeNull();
  });
});

describe("media-notes renderer", () => {
  it("adds a note at a typed time and keeps notes in time order", () => {
    const engine = renderForm();
    const group = screen.getByRole("group", { name: "Moments" });
    const time = within(group).getByRole("textbox", { name: "Time" });
    const note = within(group).getByRole("textbox", { name: "Note" });
    const add = within(group).getByRole("button", { name: "Add note" });
    expect(add).toHaveProperty("disabled", true);
    fireEvent.change(time, { target: { value: "2:05" } });
    fireEvent.change(note, { target: { value: "Later" } });
    fireEvent.click(add);
    fireEvent.change(time, { target: { value: "45" } });
    fireEvent.change(note, { target: { value: "Earlier" } });
    fireEvent.keyDown(note, { key: "Enter" });
    expect(value(engine, "moments")).toEqual([
      { at: 45, text: "Earlier" },
      { at: 125, text: "Later" },
    ]);
    expect(within(group).getByRole("textbox", { name: "Note at 0:45" })).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Remove note at 2:05" }));
    expect(value(engine, "moments")).toEqual([{ at: 45, text: "Earlier" }]);
  });

  it("rejects a time it can't read", () => {
    const engine = renderForm();
    const group = screen.getByRole("group", { name: "Moments" });
    fireEvent.change(within(group).getByRole("textbox", { name: "Time" }), { target: { value: "1:99" } });
    fireEvent.change(within(group).getByRole("textbox", { name: "Note" }), { target: { value: "x" } });
    fireEvent.click(within(group).getByRole("button", { name: "Add note" }));
    expect(within(group).getByText(/Enter a time like/)).toBeTruthy();
    expect(within(group).getByRole("textbox", { name: "Time" }).getAttribute("aria-invalid")).toBe("true");
    expect(value(engine, "moments")).toBeUndefined();
  });

  it("starts at the host player's time and seeks from a note", () => {
    const seek = vi.fn();
    const engine = renderForm((node) => (
      <MediaTimeContext.Provider value={{ currentTime: () => 83.4, seek }}>{node}</MediaTimeContext.Provider>
    ));
    const group = screen.getByRole("group", { name: "Moments" });
    expect(within(group).getByRole("textbox", { name: "Time" })).toHaveProperty("value", "1:23");
    fireEvent.change(within(group).getByRole("textbox", { name: "Note" }), { target: { value: "Good cue" } });
    fireEvent.click(within(group).getByRole("button", { name: "Add note at 1:23" }));
    expect(value(engine, "moments")).toEqual([{ at: 83, text: "Good cue" }]);
    fireEvent.click(within(group).getByRole("button", { name: "Play from 1:23" }));
    expect(seek).toHaveBeenCalledWith(83);
  });
});

describe("text-highlights renderer", () => {
  it("highlights a typed passage once it has a note", () => {
    const engine = renderForm();
    const group = screen.getByRole("group", { name: "Article" });
    fireEvent.click(within(group).getByRole("button", { name: "Highlight a passage" }));
    fireEvent.change(within(group).getByRole("textbox", { name: "Passage" }), { target: { value: "supports team" } });
    const highlight = within(group).getByRole("button", { name: "Highlight" });
    expect(highlight).toHaveProperty("disabled", true);
    fireEvent.change(within(group).getByRole("textbox", { name: "Your note" }), { target: { value: "Friends" } });
    fireEvent.click(highlight);
    expect(value(engine, "article")).toEqual([{ start: 5, end: 18, quote: "supports team", note: "Friends" }]);
    expect(group.querySelector("mark")?.textContent).toBe("supports team");
    fireEvent.click(within(group).getByRole("button", { name: "Remove highlight “supports team”" }));
    expect(value(engine, "article")).toBeUndefined();
  });

  it("says when a typed passage isn't in the text", () => {
    renderForm();
    const group = screen.getByRole("group", { name: "Article" });
    fireEvent.click(within(group).getByRole("button", { name: "Highlight a passage" }));
    fireEvent.change(within(group).getByRole("textbox", { name: "Passage" }), { target: { value: "copper" } });
    expect(within(group).getByText(/Not found in the passage/)).toBeTruthy();
    expect(within(group).queryByRole("button", { name: "Highlight" })).toBeNull();
  });

  it("maps a text selection to offsets, also across existing marks", () => {
    const engine = renderForm((node) => (
      <SourceTextContext.Provider value="Team supports team.">{node}</SourceTextContext.Provider>
    ));
    act(() => engine.setValue("article", [{ start: 0, end: 4, quote: "Team", note: "n" }]));
    const group = screen.getByRole("group", { name: "Article" });
    const paragraph = group.querySelector("p")!;
    // Select " supports " (with the spaces, which are trimmed), in the span after the mark.
    const span = paragraph.querySelector("span")!.firstChild!;
    const range = document.createRange();
    range.setStart(span, 0);
    range.setEnd(span, 10);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(paragraph);
    fireEvent.change(within(group).getByRole("textbox", { name: "Your note" }), { target: { value: "verb" } });
    fireEvent.click(within(group).getByRole("button", { name: "Highlight" }));
    expect(value(engine, "article")).toEqual([
      { start: 0, end: 4, quote: "Team", note: "n" },
      { start: 5, end: 13, quote: "supports", note: "verb" },
    ]);
  });

  it("flags a highlight without a note", () => {
    const engine = renderForm();
    act(() => engine.setValue("article", [{ start: 0, end: 4, quote: "Team", note: "" }]));
    expect(engine.getState().errors.article ?? null).toBeNull();
    act(() => void engine.submit());
    expect(engine.getState().errors.article).toBe("Add a note to each highlight.");
    expect(screen.getByRole("textbox", { name: "Note on “Team”" }).getAttribute("aria-invalid")).toBe("true");
  });
});
