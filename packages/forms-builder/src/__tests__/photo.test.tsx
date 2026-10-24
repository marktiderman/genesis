import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { parseForm, UPLOAD_FIELD_TYPES, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";
import { createField, defaultPalette, emptyForm, FormBuilder, formulaNames, paletteTypes } from "../index";

const photoForm = (props?: FieldBlock["props"]): FormDefinition => ({
  ...emptyForm("equipment"),
  blocks: [{ kind: "field", id: "q_p", key: "photo", type: "photo", label: "Add a photo (optional)", ...(props ? { props } : {}) }],
});
const photoProps = (def: FormDefinition | undefined) => (def?.blocks[0] as FieldBlock | undefined)?.props;

describe("photo field in the builder", () => {
  it("is opt-in: only a host that stores files offers it", () => {
    expect(defaultPalette()).not.toContain("photo");
    expect(paletteTypes().map((e) => e.type)).not.toContain("photo");
    const entry = paletteTypes({ palette: [...defaultPalette(), ...UPLOAD_FIELD_TYPES] }).find((e) => e.type === "photo");
    expect(entry).toMatchObject({ label: "Photo", category: "media" });
    expect(entry!.icon).toBeTruthy();
  });

  it("adds a valid photo field", () => {
    const def = emptyForm("f");
    expect(parseForm({ ...def, blocks: [createField(def, { type: "photo" })] }).ok).toBe(true);
  });

  it("edits the most photos, the size limit and the formats", () => {
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={photoForm()} onChange={(d) => (last = d)} palette={[...defaultPalette(), ...UPLOAD_FIELD_TYPES]} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_p"));

    const most = screen.getByLabelText("Most photos");
    fireEvent.change(most, { target: { value: "9" } });
    fireEvent.blur(most);
    expect(photoProps(last)?.maxFiles).toBe(5);

    const size = screen.getByLabelText("Largest photo (MB)");
    fireEvent.change(size, { target: { value: "4" } });
    fireEvent.blur(size);
    expect(photoProps(last)?.maxSizeMb).toBe(4);

    fireEvent.click(screen.getByRole("checkbox", { name: "HEIC (iPhone)" }));
    expect(photoProps(last)?.formats).toEqual(["jpeg", "png", "webp"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "HEIC (iPhone)" }));
    expect(photoProps(last)?.formats).toBeUndefined();
    expect(parseForm(last!).ok).toBe(true);
  });

  it("keeps at least one format", () => {
    render(<FormBuilder defaultValue={photoForm({ formats: ["jpeg"] })} palette={[...defaultPalette(), ...UPLOAD_FIELD_TYPES]} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_p"));
    expect(screen.getByRole("checkbox", { name: "JPEG" })).toHaveProperty("disabled", true);
  });

  it("leaves photos out of what a formula can read", () => {
    const def: FormDefinition = {
      ...photoForm(),
      blocks: [
        ...photoForm().blocks,
        { kind: "field", id: "q_n", key: "n", type: "number", label: "N" },
        { kind: "field", id: "q_c", key: "c", type: "calculated", label: "C", props: { formula: "n" } },
      ],
    };
    expect(formulaNames(def, def.blocks[2] as FieldBlock)).toEqual(["n"]);
  });
});
