import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createForm, defineForm, f } from "@marktiderman/genesis-forms";
import { Form } from "../index";

const form = defineForm({
  id: "calc",
  title: "Calc",
  layout: { mode: "classic" },
  blocks: [
    f.shortText("hours", { label: "Hours" }),
    f.shortText("rate", { label: "Rate" }),
    f.calculated("pay", { label: "Pay", formula: "hours * rate", decimals: 2 }),
    f.calculated("share", { label: "Share", formula: "hours / 40", format: "percent" }),
  ],
});

describe("calculated renderer", () => {
  it("shows the worked-out value, read-only, updating as answers change", () => {
    const engine = createForm(form.definition);
    render(<Form form={form} engine={engine} />);
    const pay = screen.getByRole("status", { name: "Pay" });
    expect(pay.tagName).toBe("OUTPUT");
    expect(pay.textContent).toBe("—");
    fireEvent.change(screen.getByRole("textbox", { name: "Hours" }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Rate" }), { target: { value: "12.5" } });
    expect(pay.textContent).toBe("125.00");
    expect(screen.getByRole("status", { name: "Share" }).textContent).toBe("25%");
    // Nothing to type into: only the two questions are text boxes.
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(engine.answers()).toMatchObject({ pay: 125, share: 0.25 });
  });
});
