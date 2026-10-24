// @feat:forms-web
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { defineForm, f, type FormEngine } from "@marktiderman/genesis-forms";
import { Form } from "../index";

const coaches = [
  { value: "c-ada", label: "Ada Lovelace" },
  { value: "c-sam", label: "Sam Hill" },
];

const form = defineForm({
  id: "coach",
  title: "Coach",
  layout: { mode: "classic" },
  blocks: [
    f.singleChoice("coach", { label: "Your coach", required: true, optionsFrom: { source: "host", key: "coaches" } }),
    f.dropdown("other", {
      label: "Anyone else?",
      options: [{ value: "none", label: "No one" }],
      optionsFrom: { source: "host", key: "coaches" },
    }),
  ],
});

describe("<Form hostOptions>", () => {
  it("renders the app's options after the question's own, and sends their values", async () => {
    let sent: FormEngine | undefined;
    render(<Form form={form} hostOptions={{ coaches }} onSubmit={(engine) => void (sent = engine)} />);
    fireEvent.click(screen.getByRole("radio", { name: "Sam Hill" }));
    const select = screen.getByLabelText(/Anyone else\?/) as HTMLSelectElement;
    expect(Array.from(select.options, (o) => o.textContent)).toEqual(["Choose…", "No one", "Ada Lovelace", "Sam Hill"]);
    fireEvent.change(select, { target: { value: "c-ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/thank/i);
    expect(sent?.answers()).toEqual({ coach: "c-sam", other: "c-ada" });
  });

  it("without the lists, shows only the question's own options", () => {
    render(<Form form={form} />);
    expect(screen.queryByRole("radio", { name: "Sam Hill" })).toBeNull();
    const select = screen.getByLabelText(/Anyone else\?/) as HTMLSelectElement;
    expect(Array.from(select.options, (o) => o.textContent)).toEqual(["Choose…", "No one"]);
  });
});
