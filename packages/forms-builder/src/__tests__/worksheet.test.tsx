import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { parseForm, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";
import { createField, emptyForm, FormBuilder, paletteTypes, SMACTALK_COLUMNS, type FieldTypeEditor } from "../index";

const WORKSHEET_TYPES = ["list", "rows", "timestamp-notes", "highlights"];

const withField = (field: Omit<FieldBlock, "kind" | "id" | "key">): FormDefinition => ({
  ...emptyForm("worksheet"),
  blocks: [{ kind: "field", id: "q_w", key: "w", ...field }],
});

describe("worksheet field types in the builder", () => {
  it("lists them in the palette, with icons", () => {
    const entries = paletteTypes();
    for (const type of WORKSHEET_TYPES) {
      const entry = entries.find((e) => e.type === type);
      expect(entry, type).toBeTruthy();
      expect(entry!.icon).toBeTruthy();
    }
    expect(entries.find((e) => e.type === "rows")).toMatchObject({ label: "Rows", category: "advanced" });
    expect(entries.find((e) => e.type === "highlights")).toMatchObject({ category: "media" });
  });

  it("gives a new rows field the SMACtalk columns, and every new field a valid form", () => {
    const def = emptyForm("f");
    const rows = createField(def, { type: "rows" });
    expect(rows.props).toEqual({
      columns: [
        { key: "say", label: "Say" },
        { key: "mean", label: "Mean", long: true },
        { key: "apply", label: "Apply", long: true },
        { key: "commit", label: "Commit" },
      ],
      minRows: 1,
      maxRows: 3,
    });
    expect(SMACTALK_COLUMNS).toHaveLength(4);
    for (const type of WORKSHEET_TYPES) {
      const parsed = parseForm({ ...def, blocks: [createField(def, { type })] });
      expect(parsed.ok, type).toBe(true);
    }
  });

  it("lets a host editor replace the built-in one", () => {
    const host: FieldTypeEditor = { type: "rows", label: "Takeaways" };
    const entry = paletteTypes({ fieldEditors: [host] }).find((e) => e.type === "rows");
    expect(entry).toMatchObject({ label: "Takeaways" });
    expect(entry!.icon).toBeUndefined();
  });

  it("edits a rows field's columns and limits", () => {
    let last: FormDefinition | undefined;
    const def = withField({ type: "rows", label: "Takeaways", props: { columns: [{ key: "say", label: "Say" }], maxRows: 3 } });
    render(<FormBuilder defaultValue={def} onChange={(d) => (last = d)} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_w"));
    fireEvent.click(screen.getByTestId("builder-column-add"));
    expect(last?.blocks[0]).toMatchObject({ props: { columns: [{ key: "say" }, { key: "column_2", label: "Column 2" }] } });
    fireEvent.change(screen.getByLabelText("Column 2 label"), { target: { value: "Mean" } });
    fireEvent.click(screen.getByRole("switch", { name: "Column 2 long answer" }));
    const key = screen.getByLabelText("Column 2 key");
    fireEvent.change(key, { target: { value: "Mean It" } });
    fireEvent.blur(key);
    expect((last?.blocks[0] as FieldBlock).props?.columns).toEqual([
      { key: "say", label: "Say" },
      { key: "mean_it", label: "Mean", long: true },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    expect((last?.blocks[0] as FieldBlock).props?.columns).toEqual([{ key: "mean_it", label: "Mean", long: true }]);
    expect(screen.getByRole("button", { name: "Remove column 1" })).toHaveProperty("disabled", true);

    const most = screen.getByLabelText("Most rows");
    fireEvent.change(most, { target: { value: "5" } });
    fireEvent.blur(most);
    expect((last?.blocks[0] as FieldBlock).props?.maxRows).toBe(5);
  });

  it("edits list, notes and highlights settings, and previews each type", () => {
    let last: FormDefinition | undefined;
    const def: FormDefinition = {
      ...emptyForm("worksheet"),
      blocks: [
        { kind: "field", id: "q_l", key: "l", type: "list", label: "Keep doing" },
        { kind: "field", id: "q_t", key: "t", type: "timestamp-notes", label: "Moments" },
        { kind: "field", id: "q_h", key: "h", type: "highlights", label: "Verse" },
      ],
      layout: { mode: "classic" },
    };
    render(<FormBuilder defaultValue={def} onChange={(d) => (last = d)} />);
    const preview = screen.getByTestId("builder-preview");
    expect(within(preview).getByRole("group", { name: "Keep doing" })).toBeTruthy();
    expect(within(preview).getByRole("group", { name: "Moments" })).toBeTruthy();
    expect(within(preview).getByText("There is no passage to highlight.")).toBeTruthy();

    fireEvent.click(screen.getByTestId("builder-block-toggle-q_l"));
    const most = screen.getByLabelText("Most items");
    fireEvent.change(most, { target: { value: "4" } });
    fireEvent.blur(most);
    fireEvent.change(screen.getByLabelText("Placeholder"), { target: { value: "One thing" } });
    expect(last?.blocks[0]).toMatchObject({ props: { max: 4, placeholder: "One thing" } });

    fireEvent.click(screen.getByTestId("builder-block-toggle-q_t"));
    const notes = screen.getByLabelText("Most notes");
    fireEvent.change(notes, { target: { value: "5" } });
    fireEvent.blur(notes);
    expect(last?.blocks[1]).toMatchObject({ props: { maxNotes: 5 } });

    fireEvent.click(screen.getByTestId("builder-block-toggle-q_h"));
    fireEvent.change(screen.getByLabelText("Passage"), { target: { value: "Iron sharpens iron." } });
    expect(last?.blocks[2]).toMatchObject({ props: { text: "Iron sharpens iron." } });
  });
});
