import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { FormBuilder, type FieldPanelProps, type FieldTypeEditor } from "../index";
import { fixtureTemplate } from "./fixtures";

const visitFeedback = (): FormDefinition => {
  const def = fixtureTemplate("visit-feedback").create();
  return {
    ...def,
    endings: [...(def.endings ?? []), { id: "early", title: "See you soon" }],
    hidden: [{ name: "owner", type: "string", source: "host" }],
  };
};

// A control inside a disabled <fieldset> keeps `.disabled === false`; what
// browsers (and assistive tech) act on is its `:disabled` state, which
// happy-dom does not derive from the fieldset, so that part is checked here.
const isDisabled = (el: Element) => el.matches(":disabled") || el.closest("fieldset[disabled]") !== null;

const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });

describe("<FormBuilder readOnly>", () => {
  it("keeps every panel, marks itself read only and hides undo/redo", () => {
    render(<FormBuilder defaultValue={visitFeedback()} readOnly />);
    for (const name of ["Questions", "Logic and endings", "Settings", "JSON"]) expect(tab(name)).toBeTruthy();
    expect(screen.getByTestId("builder-readonly").textContent).toContain("Read only");
    expect(screen.getByTestId("form-builder").hasAttribute("data-readonly")).toBe(true);
    expect(screen.queryByTestId("builder-undo")).toBeNull();
    expect(screen.queryByTestId("builder-redo")).toBeNull();
    const title = screen.getByLabelText("Form title") as HTMLInputElement;
    expect(title.readOnly).toBe(true);
    expect(title.getAttribute("aria-describedby")).toBe(screen.getByTestId("builder-readonly-note").id);
    expect(screen.getByTestId("builder-preview")).toBeTruthy();
  });

  it("lets a question be opened and read, but not changed, moved, copied or removed", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={visitFeedback()} readOnly onChange={onChange} />);
    expect(screen.queryByTestId("builder-add-block")).toBeNull();
    expect(screen.queryByTestId("builder-block-grip-q_rating")).toBeNull();
    expect(screen.queryByTestId("builder-block-delete-q_rating")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Move|Duplicate|Delete) "/ })).toBeNull();

    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    const label = screen.getByTestId("builder-field-label") as HTMLInputElement;
    expect(label.value).toBe("How was your visit today?");
    expect(isDisabled(label)).toBe(true);
    expect(isDisabled(screen.getByTestId("builder-field-key"))).toBe(true);
    expect(isDisabled(screen.getByTestId("builder-field-required"))).toBe(true);
    expect(label.closest("fieldset")?.disabled).toBe(true);
    // The row that opened it stays usable, so another question can be read.
    expect(isDisabled(screen.getByTestId("builder-block-toggle-q_better"))).toBe(false);
  });

  it("never changes the value or calls onChange, even if an edit gets through", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={visitFeedback()} readOnly onChange={onChange} />);
    const title = screen.getByLabelText("Form title") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "Changed" } });
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    fireEvent.change(screen.getByTestId("builder-field-label"), { target: { value: "Changed" } });
    fireEvent.keyDown(screen.getByTestId("builder-block-toggle-q_rating"), { key: "z", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(title.value).toBe("How was your visit?");
  });

  it("does not report pending drafts on unmount", () => {
    const onChange = vi.fn();
    const { unmount } = render(<FormBuilder defaultValue={visitFeedback()} readOnly onChange={onChange} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    fireEvent.change(screen.getByTestId("builder-field-key"), { target: { value: "typed" } });
    unmount();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows rules without add, move or delete, and with their editor disabled", () => {
    render(<FormBuilder defaultValue={visitFeedback()} readOnly defaultTab="logic" />);
    expect(screen.queryByTestId("builder-add-rule-show")).toBeNull();
    expect(screen.queryByTestId("builder-add-rule-jump")).toBeNull();
    expect(screen.queryByRole("button", { name: /rule (up|down)|Delete rule/ })).toBeNull();
    const rule = screen.getByTestId("builder-rule-r_better");
    expect(within(rule).queryByRole("button", { name: /Actions for rule/ })).toBeNull();
    expect(within(rule).getByLabelText("Question").closest("fieldset[disabled]")).toBeTruthy();
    expect(isDisabled(within(rule).getByLabelText("Question"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Remove condition" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add condition/ })).toBeNull();
  });

  it("shows endings without add or delete, and their fields disabled", () => {
    render(<FormBuilder defaultValue={visitFeedback()} readOnly defaultTab="endings" />);
    expect(screen.queryByTestId("builder-add-ending")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete ending" })).toBeNull();
    const early = screen.getByTestId("builder-ending-early");
    expect(isDisabled(within(early).getByLabelText("Title"))).toBe(true);
  });

  it("shows settings and hidden inputs disabled, without add or delete", () => {
    render(<FormBuilder defaultValue={visitFeedback()} readOnly defaultTab="settings" />);
    expect(isDisabled(screen.getByTestId("builder-anonymous"))).toBe(true);
    expect(isDisabled(screen.getByTestId("builder-form-title"))).toBe(true);
    expect(isDisabled(screen.getByLabelText("Name"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Add hidden input/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete hidden input/ })).toBeNull();
  });

  it("shows the JSON as selectable read-only text with no Apply", () => {
    render(<FormBuilder defaultValue={visitFeedback()} readOnly defaultTab="json" />);
    const json = screen.getByTestId("builder-json") as HTMLTextAreaElement;
    expect(json.readOnly).toBe(true);
    expect(isDisabled(json)).toBe(false);
    expect(screen.queryByTestId("builder-json-apply")).toBeNull();
  });

  it("tells a field type's own panel it is read-only, and its edits do nothing", () => {
    const onChange = vi.fn();
    let seen: FieldPanelProps | undefined;
    const editor: FieldTypeEditor = {
      type: "rating",
      Panel: (props) => {
        seen = props;
        return (
          <button type="button" data-testid="custom-edit" onClick={() => props.setProps({ max: 9 })}>
            Edit
          </button>
        );
      },
    };
    render(<FormBuilder defaultValue={visitFeedback()} readOnly onChange={onChange} fieldEditors={[editor]} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    expect(seen?.readOnly).toBe(true);
    expect(isDisabled(screen.getByTestId("custom-edit"))).toBe(true);
    seen!.setProps({ max: 9 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still edits normally without readOnly", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={visitFeedback()} onChange={onChange} />);
    expect(screen.queryByTestId("builder-readonly")).toBeNull();
    expect(screen.getByTestId("builder-undo")).toBeTruthy();
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    expect(isDisabled(screen.getByTestId("builder-field-label"))).toBe(false);
  });
});
