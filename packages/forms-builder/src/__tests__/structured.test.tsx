import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { parseForm, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";
import { STRUCTURED_FIELD_TYPES } from "@marktiderman/genesis-forms";
import { createField, defaultPalette, emptyForm, FormBuilder, paletteTypes, DEFAULT_TABLE_COLUMNS, type FieldTypeEditor } from "../index";

const STRUCTURED_TYPES = [...STRUCTURED_FIELD_TYPES];
const structuredPalette = [...defaultPalette(), ...STRUCTURED_FIELD_TYPES];

const withField = (field: Omit<FieldBlock, "kind" | "id" | "key">): FormDefinition => ({
  ...emptyForm("structured"),
  blocks: [{ kind: "field", id: "q_w", key: "w", ...field }],
});

describe("structured field types in the builder", () => {
  it("leaves them out of the default palette, so existing hosts don't change", () => {
    const types = paletteTypes().map((e) => e.type);
    expect(types).toContain("short-text");
    for (const type of STRUCTURED_TYPES) expect(types, type).not.toContain(type);
  });

  it("lists them, with icons, for a host that opts in", () => {
    const entries = paletteTypes({ palette: structuredPalette });
    for (const type of STRUCTURED_TYPES) {
      const entry = entries.find((e) => e.type === type);
      expect(entry, type).toBeTruthy();
      expect(entry!.icon).toBeTruthy();
    }
    expect(entries.find((e) => e.type === "table")).toMatchObject({ label: "Table", category: "advanced" });
    expect(entries.find((e) => e.type === "text-highlights")).toMatchObject({ category: "media" });
  });

  it("gives a new table field two neutral columns, and every new field a valid form", () => {
    const def = emptyForm("f");
    const table = createField(def, { type: "table" });
    expect(table.props).toEqual({
      columns: [
        { key: "column_1", label: "Column 1" },
        { key: "column_2", label: "Column 2" },
      ],
      minRows: 1,
      maxRows: 3,
    });
    expect(DEFAULT_TABLE_COLUMNS).toHaveLength(2);
    for (const type of STRUCTURED_TYPES) {
      const parsed = parseForm({ ...def, blocks: [createField(def, { type })] });
      expect(parsed.ok, type).toBe(true);
    }
  });

  it("lets a host editor replace the built-in one", () => {
    const host: FieldTypeEditor = { type: "table", label: "Action items" };
    const entry = paletteTypes({ palette: structuredPalette, fieldEditors: [host] }).find((e) => e.type === "table");
    expect(entry).toMatchObject({ label: "Action items" });
    expect(entry!.icon).toBeUndefined();
  });

  it("edits a table field's columns and limits", () => {
    let last: FormDefinition | undefined;
    const def = withField({ type: "table", label: "Action items", props: { columns: [{ key: "task", label: "Task" }], maxRows: 3 } });
    render(<FormBuilder defaultValue={def} onChange={(d) => (last = d)} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_w"));
    fireEvent.click(screen.getByTestId("builder-column-add"));
    expect(last?.blocks[0]).toMatchObject({ props: { columns: [{ key: "task" }, { key: "column_2", label: "Column 2" }] } });
    fireEvent.change(screen.getByLabelText("Column 2 label"), { target: { value: "Owner" } });
    fireEvent.click(screen.getByRole("switch", { name: "Column 2 long answer" }));
    const key = screen.getByLabelText("Column 2 key");
    fireEvent.change(key, { target: { value: "Owner Name" } });
    fireEvent.blur(key);
    expect((last?.blocks[0] as FieldBlock).props?.columns).toEqual([
      { key: "task", label: "Task" },
      { key: "owner_name", label: "Owner", long: true },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    expect((last?.blocks[0] as FieldBlock).props?.columns).toEqual([{ key: "owner_name", label: "Owner", long: true }]);
    expect(screen.getByRole("button", { name: "Remove column 1" })).toHaveProperty("disabled", true);

    const most = screen.getByLabelText("Most rows");
    fireEvent.change(most, { target: { value: "5" } });
    fireEvent.blur(most);
    expect((last?.blocks[0] as FieldBlock).props?.maxRows).toBe(5);
  });

  it("edits list, notes and highlights settings, and previews each type", () => {
    let last: FormDefinition | undefined;
    const def: FormDefinition = {
      ...emptyForm("structured"),
      blocks: [
        { kind: "field", id: "q_l", key: "l", type: "list", label: "Goals" },
        { kind: "field", id: "q_t", key: "t", type: "media-notes", label: "Moments" },
        { kind: "field", id: "q_h", key: "h", type: "text-highlights", label: "Article" },
      ],
      layout: { mode: "classic" },
    };
    render(<FormBuilder defaultValue={def} onChange={(d) => (last = d)} />);
    const preview = screen.getByTestId("builder-preview");
    expect(within(preview).getByRole("group", { name: "Goals" })).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Passage"), { target: { value: "Team supports team." } });
    expect(last?.blocks[2]).toMatchObject({ props: { text: "Team supports team." } });
  });
});
