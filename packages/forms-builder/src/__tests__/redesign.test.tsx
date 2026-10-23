// @feat:forms-builder
/** The redesigned Questions and Logic and endings panels, and the host hooks added with them. */
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { FieldBlock, FormDefinition, LogicRule } from "@marktiderman/genesis-forms";
import { SettingsRow } from "@marktiderman/genesis-ui/patterns";
import { analyze, flowCheck, FormBuilder, type BuilderHistoryState, type FormBuilderHandle } from "../index";

const form = (): FormDefinition => ({
  schemaVersion: 1,
  id: "f",
  title: "Saturday check-in",
  layout: { mode: "focus" },
  blocks: [
    { kind: "field", id: "q_wod", key: "wod", type: "rating", label: "How was today's WOD?", props: { max: 5 } },
    { kind: "field", id: "q_wrong", key: "wrong", type: "short-text", label: "What went wrong?" },
    { kind: "field", id: "q_photo", key: "photo", type: "consent", label: "Photo consent", required: true },
  ],
  endings: [
    { id: "default", title: "Thanks for your answers." },
    { id: "loved", title: "Glad you loved it!" },
  ],
});

const withJump = (): FormDefinition => ({
  ...form(),
  logic: [{ id: "r_five", effect: "jump", from: "q_wod", to: { ending: "loved" }, when: { op: "eq", left: { field: "q_wod" }, right: { value: 5 } } }],
});

const tab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });
const lastBlocks = (fn: ReturnType<typeof vi.fn>) => (fn.mock.lastCall![0] as FormDefinition).blocks.map((b) => b.id);

describe("the Questions panel", () => {
  it("shows an outline row per block and the first question's editor only", () => {
    render(<FormBuilder defaultValue={form()} />);
    const outline = screen.getByTestId("builder-outline");
    expect(within(outline).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    expect(within(screen.getByTestId("builder-block-q_photo")).getByText(/^3 · .+ · Required$/)).toBeTruthy();
    expect(screen.getByTestId("builder-block-toggle-q_wod").getAttribute("aria-current")).toBe("true");
    // One editor: the selected question's.
    expect(screen.getAllByTestId("builder-field-label")).toHaveLength(1);
    const editor = screen.getByTestId("builder-editor");
    expect(within(editor).getByRole("heading", { name: "Question 1" })).toBeTruthy();
    expect((screen.getByTestId("builder-field-label") as HTMLInputElement).value).toBe("How was today's WOD?");
    // The endings are listed under the outline.
    expect(within(outline).getByText("Glad you loved it!")).toBeTruthy();
  });

  it("selects another question from the outline", () => {
    render(<FormBuilder defaultValue={form()} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_photo"));
    expect(within(screen.getByTestId("builder-editor")).getByRole("heading", { name: "Question 3" })).toBeTruthy();
    expect(screen.getByTestId("builder-consent-text")).toBeTruthy();
  });

  it("reorders from the keyboard with the row's handle", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={form()} onChange={onChange} />);
    const handle = screen.getByRole("button", { name: "Reorder Photo consent" });
    // Alt+Up moves one step without picking up.
    fireEvent.keyDown(handle, { key: "ArrowUp", altKey: true });
    expect(lastBlocks(onChange)).toEqual(["q_wod", "q_photo", "q_wrong"]);
  });

  it("moves, duplicates and deletes from the editor's header", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={form()} onChange={onChange} />);
    const editor = () => screen.getByTestId("builder-editor");
    fireEvent.click(within(editor()).getByRole("button", { name: 'Move "How was today\'s WOD?" down' }));
    expect(lastBlocks(onChange)).toEqual(["q_wrong", "q_wod", "q_photo"]);
    fireEvent.click(within(editor()).getByRole("button", { name: 'Duplicate "How was today\'s WOD?"' }));
    // The copy is selected.
    expect((screen.getByTestId("builder-field-label") as HTMLInputElement).value).toBe("How was today's WOD? (copy)");
    fireEvent.click(within(editor()).getByRole("button", { name: 'Delete "How was today\'s WOD? (copy)"' }));
    expect(lastBlocks(onChange)).toEqual(["q_wrong", "q_wod", "q_photo"]);
    // The next question takes the editor.
    expect((screen.getByTestId("builder-field-label") as HTMLInputElement).value).toBe("Photo consent");
  });

  it("sets a rating's scale, display and end labels with segmented controls", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={form()} onChange={onChange} />);
    fireEvent.click(within(screen.getByTestId("builder-rating-scale")).getByText("1–10"));
    fireEvent.click(within(screen.getByTestId("builder-rating-display")).getByText("Stars"));
    const rating = () => (onChange.mock.lastCall![0] as FormDefinition).blocks[0] as FieldBlock;
    expect(rating().props).toMatchObject({ max: 10, display: "stars" });
    expect(screen.getByLabelText("Label under 10")).toBe(screen.getByTestId("builder-scale-high"));
    fireEvent.click(within(screen.getByTestId("builder-rating-display")).getByText("Numbers"));
    expect(rating().props?.display).toBeUndefined();
  });

  it("explains Required in one line and keeps Advanced closed", () => {
    render(<FormBuilder defaultValue={form()} />);
    expect(screen.getByText("People can't send the form without answering.")).toBeTruthy();
    expect(screen.getByTestId("builder-field-advanced").getAttribute("aria-expanded")).toBe("false");
  });

  it("shows the live preview beside the panel, with phone/desktop and one-by-one/one-page controls", () => {
    render(<FormBuilder defaultValue={form()} />);
    const preview = screen.getByTestId("builder-preview");
    expect(screen.getByTestId("builder-aside").contains(preview)).toBe(true);
    expect(within(preview).getByText("Live preview · updates as you type")).toBeTruthy();
    fireEvent.click(within(preview).getByRole("radio", { name: "Desktop" }));
    expect(preview.querySelector("[data-device]")?.getAttribute("data-device")).toBe("desktop");
    expect(within(preview).getByRole("radio", { name: "One by one" }).getAttribute("data-state")).toBe("on");
  });

  it("keeps one preview, with its device and answers, across panels", () => {
    const def = form();
    def.layout = { mode: "classic" };
    render(<FormBuilder defaultValue={def} />);
    const preview = screen.getByTestId("builder-preview");
    fireEvent.click(within(preview).getByRole("radio", { name: "Desktop" }));
    fireEvent.change(within(preview).getByLabelText("What went wrong?"), { target: { value: "Too hot" } });
    tab(/Logic and endings/);
    tab(/Settings/);
    tab(/Questions/);
    expect(screen.getAllByTestId("builder-preview")).toHaveLength(1);
    expect(screen.getByTestId("builder-preview")).toBe(preview);
    expect(preview.querySelector("[data-device]")?.getAttribute("data-device")).toBe("desktop");
    expect((within(preview).getByLabelText("What went wrong?") as HTMLInputElement).value).toBe("Too hot");
  });

  it("shows the preview on Logic and endings for a host with its own tabs, under the flow map", () => {
    render(<FormBuilder defaultValue={withJump()} tabs={false} tab="logic" />);
    const aside = screen.getByTestId("builder-aside");
    expect(within(aside).getByTestId("builder-preview")).toBeTruthy();
    expect(within(aside).getByTestId("builder-flow")).toBeTruthy();
  });

  it("adds a question from the outline at the end", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={form()} onChange={onChange} />);
    // The first question is selected; the new one still goes last.
    fireEvent.pointerDown(screen.getByTestId("builder-add-block"), { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(screen.getAllByRole("menuitem").find((i) => i.textContent === "Short text")!);
    const ids = lastBlocks(onChange);
    expect(ids.slice(0, 3)).toEqual(["q_wod", "q_wrong", "q_photo"]);
    expect(ids).toHaveLength(4);
    expect(screen.getByTestId(`builder-block-toggle-${ids[3]}`).getAttribute("aria-current")).toBe("true");
  });

  it("keeps focus in the editor after Duplicate and Delete", () => {
    render(<FormBuilder defaultValue={form()} />);
    fireEvent.click(screen.getByRole("button", { name: 'Duplicate "How was today\'s WOD?"' }));
    // The copy's editor replaced the original's: focus is on its Duplicate, not on <body>.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: 'Duplicate "How was today\'s WOD? (copy)"' }));
    fireEvent.click(screen.getByRole("button", { name: 'Delete "How was today\'s WOD? (copy)"' }));
    expect(document.activeElement).toBe(screen.getByTestId("builder-editor"));
  });

  it("opens an ending from the outline in the Logic and endings panel", () => {
    const onTabChange = vi.fn();
    render(<FormBuilder defaultValue={form()} tabs={false} tab="questions" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByTestId("builder-outline-ending-loved"));
    expect(onTabChange).toHaveBeenCalledWith("logic");
  });

  it("undoes an edit made on the Questions panel from the Logic panel", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={form()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("builder-field-label"), { target: { value: "How was class?" } });
    tab(/Logic and endings/);
    expect(screen.getByTestId("builder-logic-endings")).toBeTruthy();
    fireEvent.click(screen.getByTestId("builder-undo"));
    expect((onChange.mock.lastCall![0] as FormDefinition).blocks[0]).toMatchObject({ label: "How was today's WOD?" });
    tab(/Questions/);
    expect((screen.getByTestId("builder-field-label") as HTMLInputElement).value).toBe("How was today's WOD?");
  });
});

describe("the Logic and endings panel", () => {
  it("reads a jump as a sentence with a kind chip, and a show rule likewise", () => {
    const def = withJump();
    def.logic!.push({ id: "r_show", effect: "show", target: "q_photo", when: { op: "answered", left: { field: "q_wrong" } } });
    render(<FormBuilder defaultValue={def} defaultTab="logic" />);
    const jump = screen.getByTestId("builder-rule-r_five");
    expect(within(jump).getByText("Rule 1")).toBeTruthy();
    expect(within(jump).getByText("Jump").closest("[data-kind]")?.getAttribute("data-kind")).toBe("jump");
    const sentence = within(jump).getByTestId("builder-rule-sentence");
    expect(within(sentence).getByText("If")).toBeTruthy();
    expect(within(sentence).getByText("finish at")).toBeTruthy();
    expect(within(sentence).getByLabelText("Go to").textContent).toContain("Ending: Glad you loved it!");
    // The jump's own question is the one it reads, so there is no separate "After" pill.
    expect(within(sentence).queryByLabelText("After")).toBeNull();
    const show = screen.getByTestId("builder-rule-r_show");
    expect(within(show).getByText("Show only when").closest("[data-kind]")?.getAttribute("data-kind")).toBe("show");
    expect(within(show).getByText("only when")).toBeTruthy();
  });

  it("names the question a jump goes after when its condition reads another one", () => {
    const def = withJump();
    def.logic![0] = { ...def.logic![0]!, from: "q_wrong" } as LogicRule;
    render(<FormBuilder defaultValue={def} defaultTab="logic" />);
    expect(within(screen.getByTestId("builder-rule-r_five")).getByLabelText("After").textContent).toContain("What went wrong?");
  });

  it("adds a jump and a show/hide rule from the header", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={form()} defaultTab="logic" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("builder-add-rule-jump"));
    fireEvent.click(screen.getByTestId("builder-add-rule-show"));
    const logic = (onChange.mock.lastCall![0] as FormDefinition).logic!;
    expect(logic.map((r) => r.effect)).toEqual(["jump", "show"]);
    expect(logic[0]).toMatchObject({ from: "q_wod", to: "q_wrong" });
  });

  it("marks only an unreachable ending Unreachable, not one with another warning", () => {
    const def = withJump();
    def.endings![1] = { id: "loved", title: "" };
    render(<FormBuilder defaultValue={def} defaultTab="logic" />);
    // An untitled ending is flagged, but a jump still reaches it.
    expect(screen.queryByTestId("builder-ending-unreachable-loved")).toBeNull();
    const unused = form();
    render(<FormBuilder defaultValue={unused} defaultTab="logic" />);
    expect(screen.getAllByTestId("builder-ending-unreachable-loved")).toHaveLength(1);
  });

  it("shows endings as cards with Default and what uses them", () => {
    render(<FormBuilder defaultValue={withJump()} defaultTab="logic" />);
    const first = screen.getByTestId("builder-ending-default");
    expect(within(first).getByText("Default")).toBeTruthy();
    expect(within(screen.getByTestId("builder-ending-loved")).queryByText("Default")).toBeNull();
    expect(screen.getByTestId("builder-ending-used-loved").textContent).toBe("Used by rule 1");
    expect(screen.getByTestId("builder-ending-used-default").textContent).toMatch(/ends normally/);
    expect(screen.getByTestId("builder-add-ending")).toBeTruthy();
  });

  it("maps the flow: steps, the jump's branch, the endings and the check", () => {
    render(<FormBuilder defaultValue={withJump()} defaultTab="logic" />);
    const flow = screen.getByTestId("builder-flow");
    expect(within(flow).getByText("1 · How was today's WOD?")).toBeTruthy();
    expect(within(flow).getByTestId("builder-flow-branch-r_five").textContent).toBe("is 5: finish at “Glad you loved it!”");
    expect(within(flow).getByTestId("builder-flow-ending-loved")).toBeTruthy();
    expect(within(flow).getByTestId("builder-flow-check").textContent).toBe("Every path ends");
  });

  it("warns in the flow map when a path check fails, and updates as rules change", () => {
    const onChange = vi.fn();
    render(<FormBuilder defaultValue={form()} defaultTab="logic" onChange={onChange} />);
    // The second ending is not used by any jump yet.
    expect(screen.getByTestId("builder-flow-check").getAttribute("data-state")).toBe("issues");
    expect(within(screen.getByTestId("builder-flow-ending-loved")).getByText("Never reached")).toBeTruthy();
    fireEvent.click(screen.getByTestId("builder-add-rule-jump"));
    expect(screen.getAllByTestId(/^builder-flow-branch-/)).toHaveLength(1);
  });

  it("tries a path from a jump's answer", () => {
    render(<FormBuilder defaultValue={withJump()} defaultTab="logic" />);
    fireEvent.click(within(screen.getByRole("group", { name: "Try a path" })).getByRole("button", { name: "Rate 5" }));
    expect(screen.getByTestId("builder-flow-path").textContent).toMatch(/Rate 5: 1 step, then “Glad you loved it!”/);
  });

  it("keeps rule actions out of a read-only builder", () => {
    render(<FormBuilder defaultValue={withJump()} defaultTab="logic" readOnly />);
    expect(screen.queryByRole("button", { name: /Actions for rule/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reorder Rule/ })).toBeNull();
    expect(screen.queryByTestId("builder-add-rule")).toBeNull();
  });
});

describe("flowCheck", () => {
  it("sums up the path findings", () => {
    expect(flowCheck(analyze(withJump()).findings).state).toBe("ok");
    expect(flowCheck(analyze(form()).findings)).toEqual({ state: "issues", count: 1 });
  });
});

describe("host hooks", () => {
  it("keeps the Settings panel's Form heading without settingsLayout", () => {
    render(<FormBuilder defaultValue={form()} tabs={false} tab="settings" />);
    expect(screen.getByRole("heading", { name: "Form" })).toBeTruthy();
  });

  it("undoes and redoes through the ref, and reports whether it can", () => {
    const ref = createRef<FormBuilderHandle>();
    const states: BuilderHistoryState[] = [];
    render(<FormBuilder ref={ref} defaultValue={form()} onHistoryChange={(s) => states.push(s)} />);
    expect(states).toEqual([{ canUndo: false, canRedo: false }]);
    expect(ref.current!.canUndo!()).toBe(false);
    fireEvent.change(screen.getByLabelText("Form title"), { target: { value: "Edited" } });
    expect(ref.current!.canUndo!()).toBe(true);
    expect(states.at(-1)).toEqual({ canUndo: true, canRedo: false });
    act(() => ref.current!.undo!());
    expect(ref.current!.getValue().title).toBe("Saturday check-in");
    expect(states.at(-1)).toEqual({ canUndo: false, canRedo: true });
    act(() => ref.current!.redo!());
    expect(ref.current!.getValue().title).toBe("Edited");
    expect(ref.current!.canRedo!()).toBe(false);
  });

  it("commits text still being typed before undo, so undo takes it back and redo restores it", () => {
    const ref = createRef<FormBuilderHandle>();
    render(<FormBuilder ref={ref} defaultValue={form()} />);
    fireEvent.click(screen.getByTestId("builder-field-advanced"));
    fireEvent.change(screen.getByTestId("builder-field-key"), { target: { value: "workout" } });
    act(() => ref.current!.undo!());
    expect((ref.current!.getValue().blocks[0] as FieldBlock).key).toBe("wod");
    expect(ref.current!.canRedo!()).toBe(true);
    act(() => ref.current!.redo!());
    expect((ref.current!.getValue().blocks[0] as FieldBlock).key).toBe("workout");
  });

  it("does nothing on undo when read-only", () => {
    const ref = createRef<FormBuilderHandle>();
    const onHistoryChange = vi.fn();
    render(<FormBuilder ref={ref} defaultValue={form()} readOnly onHistoryChange={onHistoryChange} />);
    expect(onHistoryChange).toHaveBeenLastCalledWith({ canUndo: false, canRedo: false });
    act(() => ref.current!.undo!());
    expect(ref.current!.canUndo!()).toBe(false);
  });

  it("hides the toolbar with toolbar={false}", () => {
    render(<FormBuilder defaultValue={form()} toolbar={false} actions={() => <button>Publish</button>} />);
    expect(screen.queryByLabelText("Form title")).toBeNull();
    expect(screen.queryByTestId("builder-undo")).toBeNull();
    expect(screen.queryByTestId("builder-status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    // The panels stay.
    expect(screen.getByTestId("builder-questions")).toBeTruthy();
  });

  it("leaves out the settings rows a host owns, with or without settingsLayout", () => {
    const { rerender } = render(<FormBuilder defaultValue={form()} tabs={false} tab="settings" settingsOmit={["anonymous"]} />);
    expect(screen.queryByText("Anonymous responses")).toBeNull();
    expect(screen.queryByTestId("builder-anonymous")).toBeNull();
    // The rest stays, Privacy included while it has a row.
    expect(screen.getByTestId("builder-clear-hidden")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Privacy" })).toBeTruthy();
    expect(screen.getByTestId("builder-form-title")).toBeTruthy();
    rerender(
      <FormBuilder
        defaultValue={form()}
        tabs={false}
        tab="settings"
        settingsOmit={["anonymous", "clearHiddenValues", "hidden"]}
        settingsLayout={(f) => <section data-testid="host-form-card">{f}</section>}
      />,
    );
    const card = screen.getByTestId("host-form-card");
    expect(within(card).queryByTestId("builder-anonymous")).toBeNull();
    // A section with nothing left goes with its heading.
    expect(within(card).queryByRole("heading", { name: "Privacy" })).toBeNull();
    expect(within(card).queryByRole("button", { name: /Add hidden input/ })).toBeNull();
    expect(within(card).getByTestId("builder-form-title")).toBeTruthy();
  });

  it("shows every settings row by default", () => {
    render(<FormBuilder defaultValue={form()} tabs={false} tab="settings" />);
    expect(screen.getByTestId("builder-anonymous")).toBeTruthy();
    expect(screen.getByTestId("builder-clear-hidden")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add hidden input/ })).toBeTruthy();
  });

  it("lets the host lay out the Settings panel and its rows", () => {
    render(
      <FormBuilder
        defaultValue={form()}
        tabs={false}
        tab="settings"
        settingsExtra={<p>Never shown</p>}
        settingsRow={SettingsRow}
        settingsLayout={(formSettings) => (
          <div data-testid="host-settings">
            <section data-testid="host-form-card">{formSettings}</section>
            <section>Emails</section>
          </div>
        )}
      />,
    );
    const card = screen.getByTestId("host-form-card");
    expect(within(card).getByTestId("builder-form-title")).toBeTruthy();
    expect(within(card).getByLabelText("Title")).toBe(screen.getByTestId("builder-form-title"));
    expect(card.querySelector('[data-slot="settings-row"]')).toBeTruthy();
    // Text fields sit under their row, full width, never in its non-shrinking control column.
    const intro = within(card).getByLabelText("Introduction");
    expect(intro.closest('[data-slot="settings-row"]')).toBeNull();
    expect(intro.closest("[data-row-stacked]")).toBeTruthy();
    // Switches stay in the row.
    expect(screen.getByTestId("builder-anonymous").closest('[data-slot="settings-row"]')).toBeTruthy();
    expect(screen.queryByText("Never shown")).toBeNull();
    // The host's card titles the form settings, so the panel's own "Form" heading is dropped.
    expect(within(card).queryByRole("heading", { name: "Form" })).toBeNull();
    expect(screen.queryByTestId("builder-settings-extra")).toBeNull();
  });
});
