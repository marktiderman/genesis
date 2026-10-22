import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { FormBuilder, getTemplate } from "../index";

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
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "After class" }), expect.anything());
    fireEvent.click(screen.getByTestId("builder-undo"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "How was class?" }), expect.anything());
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
