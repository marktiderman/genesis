import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { parseForm, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";
import { createPresetField, emptyForm, FormBuilder, palettePresets, paletteTypes, type FieldPreset } from "../index";

const takeaways: FieldPreset = {
  id: "takeaways",
  type: "table",
  label: "Takeaways",
  description: "Four fixed columns.",
  props: {
    columns: [
      { key: "a", label: "A" },
      { key: "b", label: "B", long: true },
      { key: "c", label: "C" },
      { key: "d", label: "D" },
    ],
  },
  field: { label: "Your takeaways", required: true, description: "One per row." },
};
const shortList: FieldPreset = { id: "short-list", type: "list", label: "Short list", category: "choice", props: { max: 4 } };
const unknown: FieldPreset = { id: "nope", type: "acme/not-registered", label: "Not registered" };
const presets = [takeaways, shortList, unknown];

const openAddMenu = async () => {
  const trigger = screen.getAllByTestId("builder-add-block").at(-1)!;
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
};

describe("field presets", () => {
  it("lists presets in their category, or their base type's, and skips unknown base types", () => {
    const entries = palettePresets({ presets });
    expect(entries.map((e) => [e.preset.id, e.type, e.category])).toEqual([
      ["takeaways", "table", "advanced"],
      ["short-list", "list", "choice"],
    ]);
    // The base type's editor icon is used when the preset has none.
    expect(entries[0]!.icon).toBeTruthy();
  });

  it("keeps the palette (and the Type select) to base types", () => {
    expect(paletteTypes({ presets }).some((e) => e.label === "Takeaways")).toBe(false);
  });

  it("shows presets in the Add menu, after the base types of their group", async () => {
    render(<FormBuilder defaultValue={emptyForm("f")} palette={["short-text", "single-choice"]} presets={presets} />);
    const items = await openAddMenu();
    expect(items).toContain("Takeaways");
    expect(items).toContain("Short list");
    expect(items).not.toContain("Not registered");
    // "Short list" joins the Choice group after Single choice; "Takeaways" opens the Advanced group.
    expect(items.indexOf("Short list")).toBeGreaterThan(items.findIndex((i) => /choice/i.test(i ?? "")));
    expect(items.indexOf("Takeaways")).toBeGreaterThan(items.indexOf("Short list"));
  });

  it("adds a field of the base type with the preset's props and settings", async () => {
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={emptyForm("f")} presets={presets} onChange={(d) => (last = d)} />);
    await openAddMenu();
    fireEvent.click(screen.getByTestId("builder-add-preset-takeaways"));
    const field = last!.blocks[0] as FieldBlock;
    expect(field).toMatchObject({
      kind: "field",
      type: "table",
      label: "Your takeaways",
      required: true,
      description: "One per row.",
    });
    // The table's defaults (row limits) stay; the preset's columns replace the default ones.
    expect(field.props).toEqual({ ...takeaways.props, minRows: 1, maxRows: 3 });
    expect(parseForm(last!).ok).toBe(true);
  });

  it("names the field after the preset when it sets no label, and copies its props", () => {
    const def = emptyForm("f");
    const a = createPresetField(def, shortList);
    expect(a).toMatchObject({ type: "list", label: "Short list", props: { max: 4 } });
    expect(a.required).toBeUndefined();
    const t1 = createPresetField(def, takeaways);
    const t2 = createPresetField(def, takeaways);
    expect(t1.props!.columns).not.toBe(t2.props!.columns);
    expect(t1.props!.columns).not.toBe(takeaways.props!.columns);
  });
});
