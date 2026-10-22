import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createForm, defineForm, f, type FormEngine } from "@marktiderman/genesis-forms";
import { Form, SubjectTextContext, SubjectTimeContext } from "../index";

const worksheet = defineForm({
  id: "worksheet",
  title: "Worksheet",
  layout: { mode: "classic" },
  blocks: [
    f.list("kalm", { label: "Keep doing", max: 3, itemPlaceholder: "One thing" }),
    f.rows("smac", {
      label: "SMACtalk",
      columns: [
        { key: "say", label: "Say" },
        { key: "mean", label: "Mean", long: true },
      ],
      maxRows: 2,
    }),
    f.timestampNotes("moments", { label: "Moments" }),
    f.highlights("verse", { label: "Verse", text: "Iron sharpens iron, and one person sharpens another." }),
  ],
});

function renderForm(wrap?: (node: React.ReactNode) => React.ReactNode) {
  const engine: FormEngine = createForm(worksheet.definition);
  const node = <Form form={worksheet} engine={engine} />;
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
    expect(value(engine, "kalm")).toEqual(["Stretch"]);

    fireEvent.click(within(group).getByRole("button", { name: "Add item" }));
    const second = within(group).getByRole("textbox", { name: "Item 2" });
    expect(document.activeElement).toBe(second);
    fireEvent.change(second, { target: { value: "Sleep" } });
    expect(value(engine, "kalm")).toEqual(["Stretch", "Sleep"]);

    fireEvent.click(within(group).getByRole("button", { name: "Remove item 1" }));
    expect(value(engine, "kalm")).toEqual(["Sleep"]);
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
    expect(value(engine, "kalm")).toEqual(["a", "", ""]);
  });

  it("reorders items from the keyboard with SortableList", () => {
    const engine = renderForm();
    act(() => engine.setValue("kalm", ["one", "two"]));
    const group = screen.getByRole("group", { name: "Keep doing" });
    fireEvent.keyDown(within(group).getByRole("button", { name: "Reorder two" }), { key: "ArrowUp", altKey: true });
    expect(value(engine, "kalm")).toEqual(["two", "one"]);
  });
});

describe("rows renderer", () => {
  it("labels every cell within a fieldset per row, and adds and removes rows", () => {
    const engine = renderForm();
    const group = screen.getByRole("group", { name: "SMACtalk" });
    const row1 = within(group).getByRole("group", { name: "Row 1" });
    fireEvent.change(within(row1).getByRole("textbox", { name: "Say" }), { target: { value: "Hi" } });
    fireEvent.change(within(row1).getByRole("textbox", { name: "Mean" }), { target: { value: "Hello" } });
    expect(value(engine, "smac")).toEqual([{ say: "Hi", mean: "Hello" }]);
    expect(within(row1).getByRole("textbox", { name: "Mean" }).tagName).toBe("TEXTAREA");

    fireEvent.click(within(group).getByRole("button", { name: "Add row" }));
    expect(within(group).getByRole("group", { name: "Row 2" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Add row" })).toHaveProperty("disabled", true);
    fireEvent.click(within(group).getByRole("button", { name: "Remove row 1" }));
    expect(value(engine, "smac")).toEqual([{}]);
    expect(within(group).queryByRole("group", { name: "Row 2" })).toBeNull();
  });
});

describe("timestamp-notes renderer", () => {
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
      <SubjectTimeContext.Provider value={{ currentTime: () => 83.4, seek }}>{node}</SubjectTimeContext.Provider>
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

describe("highlights renderer", () => {
  it("highlights a typed passage once it has a note", () => {
    const engine = renderForm();
    const group = screen.getByRole("group", { name: "Verse" });
    fireEvent.click(within(group).getByRole("button", { name: "Highlight a passage" }));
    fireEvent.change(within(group).getByRole("textbox", { name: "Passage" }), { target: { value: "sharpens iron" } });
    const highlight = within(group).getByRole("button", { name: "Highlight" });
    expect(highlight).toHaveProperty("disabled", true);
    fireEvent.change(within(group).getByRole("textbox", { name: "Your note" }), { target: { value: "Friends" } });
    fireEvent.click(highlight);
    expect(value(engine, "verse")).toEqual([{ start: 5, end: 18, quote: "sharpens iron", note: "Friends" }]);
    expect(group.querySelector("mark")?.textContent).toBe("sharpens iron");
    fireEvent.click(within(group).getByRole("button", { name: "Remove highlight “sharpens iron”" }));
    expect(value(engine, "verse")).toBeUndefined();
  });

  it("says when a typed passage isn't in the text", () => {
    renderForm();
    const group = screen.getByRole("group", { name: "Verse" });
    fireEvent.click(within(group).getByRole("button", { name: "Highlight a passage" }));
    fireEvent.change(within(group).getByRole("textbox", { name: "Passage" }), { target: { value: "copper" } });
    expect(within(group).getByText(/Not found in the passage/)).toBeTruthy();
    expect(within(group).queryByRole("button", { name: "Highlight" })).toBeNull();
  });

  it("maps a text selection to offsets, also across existing marks", () => {
    const engine = renderForm((node) => (
      <SubjectTextContext.Provider value="Iron sharpens iron.">{node}</SubjectTextContext.Provider>
    ));
    act(() => engine.setValue("verse", [{ start: 0, end: 4, quote: "Iron", note: "n" }]));
    const group = screen.getByRole("group", { name: "Verse" });
    const paragraph = group.querySelector("p")!;
    // Select " sharpens " (with the spaces, which are trimmed), in the span after the mark.
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
    expect(value(engine, "verse")).toEqual([
      { start: 0, end: 4, quote: "Iron", note: "n" },
      { start: 5, end: 13, quote: "sharpens", note: "verb" },
    ]);
  });

  it("flags a highlight without a note", () => {
    const engine = renderForm();
    act(() => engine.setValue("verse", [{ start: 0, end: 4, quote: "Iron", note: "" }]));
    expect(engine.getState().errors.verse ?? null).toBeNull();
    act(() => void engine.submit());
    expect(engine.getState().errors.verse).toBe("Add a note to each highlight.");
    expect(screen.getByRole("textbox", { name: "Note on “Iron”" }).getAttribute("aria-invalid")).toBe("true");
  });
});
