import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { FormBuilder, getTemplate, Preview } from "../index";

const afterClass = () => getTemplate("after-class")!.create();

describe("<FormBuilder>", () => {
  it("renders the questions, the preview and no blocking findings", () => {
    render(<FormBuilder defaultValue={afterClass()} />);
    expect(screen.getByLabelText("Form title")).toHaveProperty("value", "How was class?");
    expect(screen.getByTestId("builder-preview")).toBeTruthy();
    expect(screen.queryByText(/to fix/)).toBeNull();
  });

  it("reports edits through onChange and undoes them", () => {
    const onChange = vi.fn<(def: FormDefinition) => void>();
    render(<FormBuilder defaultValue={afterClass()} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Form title"), { target: { value: "After class" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "After class" }));
    fireEvent.click(screen.getByTestId("builder-undo"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "How was class?" }));
  });

  it("passes the current value and analysis to host actions", () => {
    render(
      <FormBuilder
        defaultValue={getTemplate("blank")!.create()}
        actions={(_def, analysis) => <button disabled={!analysis.canPublish}>Publish</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Publish" })).toHaveProperty("disabled", true);
    expect(within(screen.getByTestId("builder-findings")).getByText(/at least one question/)).toBeTruthy();
  });
});

describe("<FormBuilder> editing", () => {
  it("commits a key on blur, not on every keystroke", () => {
    const onChange = vi.fn<(def: FormDefinition) => void>();
    render(<FormBuilder defaultValue={afterClass()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    const key = screen.getByTestId("builder-field-key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "overall_" } });
    expect(key.value).toBe("overall_");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(key, { target: { value: "overall_score" } });
    fireEvent.blur(key);
    const last = onChange.mock.lastCall![0];
    expect(last.blocks.find((b) => b.id === "q_rating")).toMatchObject({ key: "overall_score" });
  });
});

describe("<FormBuilder> review fixes", () => {
  it("resyncs the condition JSON after undo", () => {
    const def = afterClass();
    def.logic![0]!.when = { not: { op: "gte", left: { field: "q_rating" }, right: { value: 4 } } };
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={def} defaultTab="logic" onChange={(d) => (last = d)} />);
    fireEvent.click(screen.getByTestId("builder-rule-r_better").querySelector("button[aria-expanded]")!);
    const edited = { not: { op: "gte", left: { field: "q_rating" }, right: { value: 5 } } };
    fireEvent.change(screen.getByLabelText("Condition JSON"), { target: { value: JSON.stringify(edited) } });
    expect(last?.logic?.[0]?.when).toEqual(edited);
    fireEvent.click(screen.getByTestId("builder-undo"));
    const text = (screen.getByLabelText("Condition JSON") as HTMLTextAreaElement).value;
    expect(JSON.parse(text)).toEqual(def.logic![0]!.when);
  });

  it("keeps a half-typed condition through an outside change", () => {
    const def = afterClass();
    def.logic![0]!.when = { not: { op: "gte", left: { field: "q_rating" }, right: { value: 4 } } };
    render(<FormBuilder defaultValue={def} defaultTab="logic" />);
    fireEvent.click(screen.getByTestId("builder-rule-r_better").querySelector("button[aria-expanded]")!);
    fireEvent.change(screen.getByLabelText("Form title"), { target: { value: "Edited" } });
    fireEvent.change(screen.getByLabelText("Condition JSON"), { target: { value: "{ not valid" } });
    fireEvent.click(screen.getByTestId("builder-undo"));
    expect((screen.getByLabelText("Condition JSON") as HTMLTextAreaElement).value).toBe("{ not valid");
  });

  it("undoes with Ctrl+Z inside the builder only", () => {
    let last: FormDefinition | undefined;
    render(
      <div>
        <button data-testid="host-btn">host</button>
        <FormBuilder defaultValue={afterClass()} onChange={(d) => (last = d)} />
      </div>,
    );
    fireEvent.change(screen.getByLabelText("Form title"), { target: { value: "Edited" } });
    fireEvent.keyDown(screen.getByTestId("host-btn"), { key: "z", ctrlKey: true });
    expect(last?.title).toBe("Edited");
    fireEvent.keyDown(screen.getByTestId("builder-redo"), { key: "z", ctrlKey: true });
    expect(last?.title).toBe("How was class?");
  });

  it("drags by the handle only and names the block in its buttons", () => {
    render(<FormBuilder defaultValue={afterClass()} />);
    const row = screen.getByTestId("builder-block-q_rating");
    expect(row.getAttribute("draggable")).toBeNull();
    expect(screen.getByTestId("builder-block-grip-q_rating").getAttribute("draggable")).toBe("true");
    expect(within(row).getByRole("button", { name: 'Delete "How was class today?"' })).toBeTruthy();
  });

  it("commits the highest rating on blur", () => {
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={afterClass()} onChange={(d) => (last = d)} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    const max = screen.getByLabelText("Highest rating") as HTMLInputElement;
    fireEvent.change(max, { target: { value: "1" } });
    expect(max.value).toBe("1");
    expect(last).toBeUndefined();
    fireEvent.change(max, { target: { value: "10" } });
    fireEvent.blur(max);
    expect(last?.blocks[0]).toMatchObject({ props: { max: 10 } });
  });

  it("marks a hidden input as identifying", () => {
    const def = afterClass();
    def.hidden = [{ name: "member", type: "string", source: "server" }];
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={def} defaultTab="settings" onChange={(d) => (last = d)} />);
    fireEvent.click(screen.getByTestId("builder-hidden-identifying-0"));
    expect(last?.hidden?.[0]).toMatchObject({ name: "member", identifying: true });
  });
});

describe("<Preview>", () => {
  const def = (label: string): FormDefinition => ({
    schemaVersion: 1,
    id: "f",
    title: "T",
    layout: { mode: "classic" },
    blocks: [
      { kind: "field", id: "q_name", key: "name", type: "short-text", label },
      { kind: "field", id: "q_more", key: "more", type: "short-text", label: "More" },
    ],
    endings: [{ id: "default", title: "Thanks" }],
  });

  it("keeps answers through a wording edit and restarts on a structural one", () => {
    const { rerender } = render(<Preview def={def("Your name")} />);
    const preview = screen.getByTestId("builder-preview");
    fireEvent.change(within(preview).getByLabelText("Your name"), { target: { value: "Ann" } });
    rerender(<Preview def={def("Your full name")} />);
    expect((within(preview).getByLabelText("Your full name") as HTMLInputElement).value).toBe("Ann");
    const required = def("Your full name");
    (required.blocks[0] as { required?: boolean }).required = true;
    rerender(<Preview def={required} />);
    expect((within(preview).getByLabelText(/Your full name/) as HTMLInputElement).value).toBe("");
  });

  it("keeps showing the ending through a wording edit", async () => {
    const { rerender } = render(<Preview def={def("Your name")} />);
    const preview = screen.getByTestId("builder-preview");
    fireEvent.click(within(preview).getByRole("button", { name: /submit/i }));
    expect(await within(preview).findByText("Thanks")).toBeTruthy();
    rerender(<Preview def={def("Your full name")} />);
    expect(within(preview).getByText("Thanks")).toBeTruthy();
    expect(within(preview).queryByLabelText("Your full name")).toBeNull();
  });
});
