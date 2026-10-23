import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { COMPUTED_FIELD_TYPES, parseForm, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";
import { createField, defaultPalette, emptyForm, formulaNames, FormBuilder, paletteTypes, updateBlock } from "../index";

const form = (formula = "hours * rate"): FormDefinition => ({
  ...emptyForm("f"),
  layout: { mode: "classic" },
  blocks: [
    { kind: "field", id: "q_h", key: "hours", type: "short-text", label: "Hours" },
    { kind: "field", id: "q_r", key: "rate", type: "short-text", label: "Rate" },
    { kind: "field", id: "q_p", key: "plan", type: "table", label: "Plan", props: { columns: [{ key: "cost", label: "Cost" }] } },
    { kind: "field", id: "q_c", key: "pay", type: "calculated", label: "Pay", props: { formula } },
  ],
});
const calc = (def: FormDefinition | undefined) => def?.blocks.find((b) => b.id === "q_c") as FieldBlock;

describe("calculated fields in the builder", () => {
  it("is opt-in, with an icon", () => {
    expect(paletteTypes().map((t) => t.type)).not.toContain("calculated");
    const entry = paletteTypes({ palette: [...defaultPalette(), ...COMPUTED_FIELD_TYPES] }).find((t) => t.type === "calculated");
    expect(entry).toMatchObject({ label: "Calculated", category: "advanced" });
    expect(entry!.icon).toBeTruthy();
  });

  it("starts valid", () => {
    const def = emptyForm("f");
    expect(parseForm({ ...def, blocks: [createField(def, { type: "calculated" })] }).ok).toBe(true);
  });

  it("lists the answers a formula can use", () => {
    expect(formulaNames(form(), calc(form()))).toEqual(["hours", "rate", "plan.cost"]);
  });

  it("rewrites formulas when an answer is renamed", () => {
    const def = updateBlock(form("sum(hours, plan.cost) + hours"), "q_h", { key: "time" });
    expect(calc(def).props?.formula).toBe("sum(time, plan.cost) + time");
  });

  it("edits the formula with live checks and a preview value, and hides Required", () => {
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={form()} onChange={(d) => (last = d)} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_c"));
    expect(screen.queryByTestId("builder-field-required")).toBeNull();
    expect(screen.getByTestId("builder-calculated-check").textContent).toBe("The formula works.");

    fireEvent.change(screen.getByTestId("builder-calculated-sample-hours"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("builder-calculated-sample-rate"), { target: { value: "2.5" } });
    expect(screen.getByTestId("builder-calculated-preview").textContent).toBe("25");

    const input = screen.getByTestId("builder-calculated-formula");
    fireEvent.change(input, { target: { value: "hours * wage" } });
    expect(calc(last).props?.formula).toBe("hours * wage");
    expect(screen.getByTestId("builder-calculated-check").textContent).toBe(
      'The formula uses "wage", which is not the answer name of a question in this form.',
    );
    expect(screen.getByTestId("builder-calculated-preview").textContent).toBe("—");

    fireEvent.change(input, { target: { value: "sum(plan.cost) /" } });
    expect(screen.getByTestId("builder-calculated-check").textContent).toMatch(/^Expected a number/);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "plan.cost" }));
    expect(calc(last).props?.formula).toBe("plan.cost");
    fireEvent.change(input, { target: { value: "sum(plan.cost)" } });
    fireEvent.change(screen.getByTestId("builder-calculated-sample-plan.cost"), { target: { value: "1, 2, x, 3.5" } });
    expect(screen.getByTestId("builder-calculated-preview").textContent).toBe("6.5");

    const decimals = screen.getByTestId("builder-calculated-decimals");
    fireEvent.change(decimals, { target: { value: "2" } });
    fireEvent.blur(decimals);
    expect(calc(last).props).toMatchObject({ decimals: 2 });
    expect(screen.getByTestId("builder-calculated-preview").textContent).toBe("6.50");
  });

  it("shows the value in the preview", () => {
    render(<FormBuilder defaultValue={form()} />);
    const preview = screen.getByTestId("builder-preview");
    const [hours, rate] = Array.from(preview.querySelectorAll("input"));
    fireEvent.change(hours!, { target: { value: "3" } });
    fireEvent.change(rate!, { target: { value: "4" } });
    expect(preview.querySelector("[data-gf-calculated]")?.textContent).toBe("12");
  });
});
