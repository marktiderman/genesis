// @feat:forms-web
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { defineForm, f, type FormEngine } from "@marktiderman/genesis-forms";
import { Form } from "../index";

const form = defineForm({
  id: "areas",
  title: "Facilities",
  layout: { mode: "classic" },
  blocks: [
    f.multiChoice("areas", {
      label: "Which area?",
      options: [
        { value: "cleanliness", label: "Cleanliness" },
        { value: "parking", label: "Parking" },
      ],
      other: true,
    }),
    f.singleChoice("where", {
      label: "Where?",
      options: [{ value: "front", label: "Front desk" }],
      other: { label: "Somewhere else" },
    }),
    f.dropdown("when", { label: "When?", options: [{ value: "am", label: "Morning" }], other: true }),
  ],
});

describe('an "Other" option', () => {
  it("adds a row with a text box, and the typed text is the answer", async () => {
    let sent: FormEngine | undefined;
    render(<Form form={form} onSubmit={(engine) => void (sent = engine)} />);
    expect(screen.queryByLabelText("Other: your answer")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Parking" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Other" }));
    fireEvent.change(screen.getByLabelText("Other: your answer"), { target: { value: "Lockers" } });

    fireEvent.click(screen.getByRole("radio", { name: "Somewhere else" }));
    fireEvent.change(screen.getByLabelText("Somewhere else: your answer"), { target: { value: "The rig" } });

    const select = screen.getByLabelText(/When\?/) as HTMLSelectElement;
    const otherValue = Array.from(select.options).find((o) => o.textContent === "Other")!.value;
    fireEvent.change(select, { target: { value: otherValue } });
    fireEvent.change(screen.getAllByLabelText("Other: your answer")[1]!, { target: { value: "Evenings" } });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/thank/i);
    expect(sent?.answers()).toEqual({ areas: ["parking", "Lockers"], where: "The rig", when: "Evenings" });
  });

  it("keeps the typed text when another option is picked and Other picked again", () => {
    render(<Form form={form} />);
    fireEvent.click(screen.getByRole("radio", { name: "Somewhere else" }));
    fireEvent.change(screen.getByLabelText("Somewhere else: your answer"), { target: { value: "Lobby" } });
    fireEvent.click(screen.getByRole("radio", { name: "Front desk" }));
    expect(screen.queryByLabelText("Somewhere else: your answer")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Somewhere else" }));
    expect((screen.getByLabelText("Somewhere else: your answer") as HTMLInputElement).value).toBe("Lobby");
  });

  it("unticking Other on a multiple choice drops the typed answer", async () => {
    let sent: FormEngine | undefined;
    render(<Form form={form} onSubmit={(engine) => void (sent = engine)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Other" }));
    fireEvent.change(screen.getByLabelText("Other: your answer"), { target: { value: "Lockers" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Other" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cleanliness" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/thank/i);
    expect(sent?.answers()).toEqual({ areas: ["cleanliness"] });
  });
});
