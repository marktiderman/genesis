// @feat:forms-builder
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { FieldBlock, FormDefinition } from "@marktiderman/genesis-forms";
import { createField, defaultPalette, diffDefinitions, emptyForm, FormBuilder, type FormBuilderHandle } from "../index";
import { visitFeedback } from "./fixtures";

const status = () => screen.getByTestId("builder-status");

async function addQuestion(label: string) {
  const trigger = screen.getAllByTestId("builder-add-block").at(-1)!;
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  const item = (await screen.findAllByRole("menuitem")).find((i) => i.textContent === label)!;
  fireEvent.click(item);
}

const fieldsOf = (def: FormDefinition) => def.blocks.filter((b): b is FieldBlock => b.kind === "field");

describe("an empty form", () => {
  it("shows a neutral Add a question, not an error to fix", () => {
    render(<FormBuilder defaultValue={emptyForm("f")} />);
    expect(status().textContent).toBe("Add a question");
    expect(screen.queryByText(/to fix/)).toBeNull();
    // The hint is listed as information, not as an error.
    const findings = within(screen.getByTestId("builder-findings"));
    expect(findings.getByText(/at least one question/)).toBeTruthy();
    expect(findings.getByLabelText("info")).toBeTruthy();
  });
});

describe("a new question", () => {
  it("opens untitled with its title focused, and is flagged only once the title is left empty", async () => {
    const onChange = vi.fn<(def: FormDefinition) => void>();
    render(<FormBuilder defaultValue={emptyForm("f")} onChange={onChange} />);
    await addQuestion("Rating");
    const def = onChange.mock.lastCall![0];
    const [q] = fieldsOf(def);
    expect(q).toMatchObject({ type: "rating", label: "", key: "rating" });

    const title = screen.getByTestId("builder-field-label") as HTMLInputElement;
    expect(title.value).toBe("");
    expect(title.placeholder).toBe("Your question");
    await waitFor(() => expect(document.activeElement).toBe(title));
    // Not flagged while it is being written.
    expect(status().textContent).toBe("In progress");
    expect(screen.queryByText(/needs a title/)).toBeNull();
    expect(title.hasAttribute("aria-invalid")).toBe(false);

    fireEvent.blur(title);
    expect(status().textContent).toBe("1 to fix");
    expect(screen.getAllByText("Question 1 needs a title.").length).toBeGreaterThan(0);
    expect(title.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(title, { target: { value: "How was class?" } });
    expect(status().textContent).toMatch(/Ready|to check/);
  });

  it("shows the held-back check when someone tries to publish", async () => {
    const ref = createRef<FormBuilderHandle>();
    render(<FormBuilder ref={ref} defaultValue={visitFeedback()} />);
    await addQuestion("Number");
    expect(screen.queryAllByText(/needs a title/)).toEqual([]);
    expect(ref.current!.getAnalysis().canPublish).toBe(false);
    act(() => ref.current!.revealChecks());
    expect(status().textContent).toBe("1 to fix");
  });

  it("flags an untitled question loaded with the form at once", () => {
    const def = emptyForm("f");
    def.blocks = [createField(def, { type: "short-text", label: "" })];
    render(<FormBuilder defaultValue={def} />);
    expect(status().textContent).toBe("1 to fix");
  });

  it("keeps createField's own default title for code that calls it", () => {
    expect(createField(emptyForm("f"), { type: "rating" }).label).toBe("Rating");
  });
});

describe("tabs a host can own", () => {
  it("merges logic and endings into one panel", () => {
    render(<FormBuilder defaultValue={visitFeedback()} />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Questions", "Logic and endings (2)", "Settings", "JSON"]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Logic and endings/ }), { button: 0 });
    const panel = screen.getByTestId("builder-logic-endings");
    expect(within(panel).getByRole("heading", { name: "Logic" })).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "Endings" })).toBeTruthy();
    expect(within(panel).getByTestId("builder-ending-default")).toBeTruthy();
  });

  it("with tabs={false}, shows the panel the host picks and no tab bar", () => {
    const { rerender } = render(<FormBuilder defaultValue={visitFeedback()} tabs={false} tab="logic" settingsExtra={<p>Emails</p>} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByTestId("builder-logic-endings")).toBeTruthy();
    rerender(<FormBuilder defaultValue={visitFeedback()} tabs={false} tab="settings" settingsExtra={<p>Emails</p>} />);
    expect(screen.getByTestId("builder-form-title")).toBeTruthy();
    expect(within(screen.getByTestId("builder-settings-extra")).getByText("Emails")).toBeTruthy();
    // The older name still opens the merged panel.
    rerender(<FormBuilder defaultValue={visitFeedback()} tabs={false} tab="endings" />);
    expect(screen.getByTestId("builder-logic-endings")).toBeTruthy();
  });

  it("asks the host to switch when a check points at another panel", () => {
    const onTabChange = vi.fn();
    const def = visitFeedback();
    def.endings = [...(def.endings ?? []), { id: "never", title: "Never reached" }];
    render(<FormBuilder defaultValue={def} tabs={false} tab="questions" onTabChange={onTabChange} />);
    fireEvent.click(within(screen.getByTestId("builder-findings")).getByText(/Never reached/));
    expect(onTabChange).toHaveBeenCalledWith("logic");
  });
});

describe("settings for the new types", () => {
  const withField = (type: string) => {
    const def = emptyForm("f");
    def.blocks = [createField(def, { type, label: "Q" })];
    return def;
  };
  const open = (def: FormDefinition) => fireEvent.click(screen.getByTestId(`builder-block-toggle-${def.blocks[0]!.id}`));

  it("offers dropdown, number, date and consent in the default palette", () => {
    expect(defaultPalette()).toEqual(expect.arrayContaining(["dropdown", "number", "date", "consent"]));
  });

  it("rating: end labels and stars", () => {
    const onChange = vi.fn<(def: FormDefinition) => void>();
    const def = withField("rating");
    render(<FormBuilder defaultValue={def} onChange={onChange} />);
    open(def);
    fireEvent.change(screen.getByTestId("builder-scale-low"), { target: { value: "Poor" } });
    fireEvent.change(screen.getByTestId("builder-scale-high"), { target: { value: "Great" } });
    expect(fieldsOf(onChange.mock.lastCall![0])[0]!.props).toEqual({ max: 5, lowLabel: "Poor", highLabel: "Great" });
    fireEvent.change(screen.getByTestId("builder-scale-low"), { target: { value: "" } });
    expect(fieldsOf(onChange.mock.lastCall![0])[0]!.props).toEqual({ max: 5, highLabel: "Great" });
  });

  it("number: smallest, largest and step, decimals allowed", () => {
    const onChange = vi.fn<(def: FormDefinition) => void>();
    const def = withField("number");
    render(<FormBuilder defaultValue={def} onChange={onChange} />);
    open(def);
    const step = screen.getByTestId("builder-number-step");
    fireEvent.change(step, { target: { value: "0.5" } });
    fireEvent.blur(step);
    const max = screen.getByTestId("builder-number-max");
    fireEvent.change(max, { target: { value: "10" } });
    fireEvent.blur(max);
    expect(fieldsOf(onChange.mock.lastCall![0])[0]!.props).toEqual({ step: 0.5, max: 10 });
  });

  it("date and consent", () => {
    const onChange = vi.fn<(def: FormDefinition) => void>();
    const date = withField("date");
    const { unmount } = render(<FormBuilder defaultValue={date} onChange={onChange} />);
    open(date);
    fireEvent.change(screen.getByTestId("builder-date-min"), { target: { value: "2026-01-01" } });
    expect(fieldsOf(onChange.mock.lastCall![0])[0]!.props).toEqual({ min: "2026-01-01" });
    unmount();
    const consent = withField("consent");
    render(<FormBuilder defaultValue={consent} onChange={onChange} />);
    open(consent);
    fireEvent.change(screen.getByTestId("builder-consent-text"), { target: { value: "I agree to the terms" } });
    expect(fieldsOf(onChange.mock.lastCall![0])[0]!.props).toEqual({ text: "I agree to the terms" });
  });

  it("a dropdown starts with options and keeps them when switched to single choice", () => {
    const def = withField("dropdown");
    expect((def.blocks[0] as FieldBlock).props?.options).toHaveLength(2);
  });
});

describe("diff", () => {
  it("reports end labels and the star display as wording, not a settings change", () => {
    const before = emptyForm("f");
    before.blocks = [createField(before, { type: "rating", label: "Q", props: { max: 5 } })];
    const after = structuredClone(before);
    (after.blocks[0] as FieldBlock).props = { max: 5, lowLabel: "Poor", display: "stars" };
    const changes = diffDefinitions(before, after);
    expect(changes.map((c) => c.kind)).toEqual(["text-changed"]);
    expect(changes.every((c) => !c.breaking)).toBe(true);
  });
});
