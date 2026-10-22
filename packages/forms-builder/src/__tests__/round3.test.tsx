/** Regression tests for the third review round (Blaze, PR #50) and the Vercel Agent findings: one block per finding. */
import { StrictMode, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  choiceOptions,
  parseForm,
  registerFieldType,
  type FieldBlock,
  type FormDefinition,
  type Json,
} from "@marktiderman/genesis-forms";
import type { FieldRendererProps } from "@marktiderman/genesis-forms-react";
import { defaultRegistry } from "@marktiderman/genesis-forms-web";
import { validateSubmission } from "@marktiderman/genesis-forms/server";
import {
  addHidden,
  analyze,
  createField,
  defaultProps,
  FormBuilder,
  newId,
  newOptionValue,
  paletteTypes,
  QuestionsPanel,
  removeBlock,
  setIdGenerator,
  starterValue,
  updateSettings,
  type Analysis,
  type FieldTypeEditor,
  type FormBuilderHandle,
} from "../index";
import { visitFeedback } from "./fixtures";


const counter = () => {
  let n = 0;
  return (prefix: string) => `${prefix}_${++n}`;
};

afterEach(() => setIdGenerator());

const twoFields = (): FormDefinition => ({
  schemaVersion: 1,
  id: "f",
  title: "T",
  layout: { mode: "classic" },
  blocks: [
    { kind: "field", id: "q_a", key: "a", type: "short-text", label: "A" },
    { kind: "field", id: "q_b", key: "b", type: "short-text", label: "B" },
  ],
  endings: [{ id: "default", title: "Thanks" }],
});

describe("1. actions get the current value, not the deferred one", () => {
  it("passes the edited value on the first render after the edit, and a fresh analysis on demand", () => {
    const seen: { current: boolean; analysing: boolean; fresh: boolean; passed: boolean }[] = [];
    render(
      <FormBuilder
        defaultValue={twoFields()}
        actions={(def, analysis, state) => {
          seen.push({
            current: def === state.getValue(),
            analysing: state.analysing,
            fresh: state.getAnalysis().canPublish,
            passed: analysis.canPublish,
          });
          return null;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: 'Delete "A"' }));
    fireEvent.click(screen.getByRole("button", { name: 'Delete "B"' }));
    // Every render got the current value, never the deferred one.
    expect(seen.every((c) => c.current)).toBe(true);
    // The render right after the last delete ran ahead of the checks: the
    // analysis passed in is still the old one, getAnalysis() is not.
    const stale = seen.filter((c) => c.analysing);
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.at(-1)).toMatchObject({ passed: true, fresh: false });
    expect(seen.at(-1)).toMatchObject({ analysing: false, passed: false, fresh: false });
  });

  it("gates a publish on the current analysis while the passed one is stale", () => {
    const published: FormDefinition[] = [];
    const ref = createRef<FormBuilderHandle>();
    render(
      <FormBuilder
        ref={ref}
        defaultValue={twoFields()}
        actions={(def, _analysis, state) => (
          <button
            onClick={() => {
              const value = state.flush();
              if (state.getAnalysis().canPublish) published.push(value);
            }}
          >
            Publish
          </button>
        )}
      />,
    );
    fireEvent.change(screen.getByLabelText("Form title"), { target: { value: "New title" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(published.at(-1)?.title).toBe("New title");
  });
});

describe("2. the value is reported at once, kept on unmount and readable through a ref", () => {
  it("reports an edit even when the builder unmounts before it renders again", () => {
    const onChange = vi.fn<(def: FormDefinition) => void>();
    const { unmount } = render(<FormBuilder defaultValue={visitFeedback()} onChange={onChange} />);
    act(() => {
      fireEvent.change(screen.getByLabelText("Form title"), { target: { value: "Last edit" } });
      unmount();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall).toEqual([expect.objectContaining({ title: "Last edit" })]);
  });

  it("commits a key still being typed when the builder unmounts", () => {
    const onChange = vi.fn<(def: FormDefinition) => void>();
    const { unmount } = render(<FormBuilder defaultValue={visitFeedback()} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    fireEvent.click(screen.getByTestId("builder-field-advanced"));
    fireEvent.change(screen.getByTestId("builder-field-key"), { target: { value: "overall_score" } });
    expect(onChange).not.toHaveBeenCalled();
    unmount();
    expect(onChange.mock.lastCall![0].blocks.find((b) => b.id === "q_rating")).toMatchObject({ key: "overall_score" });
  });

  it("commits a draft when its inspector closes", () => {
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={visitFeedback()} onChange={(d) => (last = d)} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    fireEvent.click(screen.getByTestId("builder-field-advanced"));
    fireEvent.change(screen.getByTestId("builder-field-key"), { target: { value: "closed_key" } });
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_rating"));
    expect(last?.blocks.find((b) => b.id === "q_rating")).toMatchObject({ key: "closed_key" });
  });

  it("gives the value, the analysis and pending drafts through the ref", () => {
    const ref = createRef<FormBuilderHandle>();
    render(<FormBuilder ref={ref} defaultValue={twoFields()} defaultTab="settings" />);
    fireEvent.click(screen.getByRole("button", { name: /Add hidden input/ }));
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "member" } });
    expect(ref.current!.getValue().hidden?.[0]?.name).toBe("input");
    let flushed: FormDefinition | undefined;
    act(() => {
      flushed = ref.current!.flush();
    });
    expect(flushed?.hidden?.[0]?.name).toBe("member");
    expect(ref.current!.getValue()).toBe(flushed);
    expect(ref.current!.getAnalysis()).toEqual(analyze(flushed!));
  });

  it("reads a fresh analysis through the ref before the deferred one catches up", () => {
    const ref = createRef<FormBuilderHandle>();
    render(<FormBuilder ref={ref} defaultValue={twoFields()} />);
    let fresh: Analysis | undefined;
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: 'Delete "A"' }));
      fireEvent.click(screen.getByRole("button", { name: 'Delete "B"' }));
      fresh = ref.current!.getAnalysis();
    });
    expect(fresh?.canPublish).toBe(false);
    expect(ref.current!.getValue().blocks).toEqual([]);
  });

  it("stays silent for the initial value under StrictMode, and reports the analysis once", async () => {
    const onChange = vi.fn();
    const onAnalysis = vi.fn<(a: Analysis, d: FormDefinition) => void>();
    const start = visitFeedback();
    render(
      <StrictMode>
        <FormBuilder defaultValue={start} onChange={onChange} onAnalysis={onAnalysis} />
      </StrictMode>,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(onAnalysis).toHaveBeenCalledTimes(1);
    expect(onAnalysis.mock.lastCall![1]).toBe(start);
    fireEvent.change(screen.getByLabelText("Form title"), { target: { value: "Strict" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onAnalysis).toHaveBeenCalledTimes(2);
    expect(onAnalysis.mock.lastCall![1]).toBe(onChange.mock.lastCall![0]);
  });
});

describe("3. ids are made in event handlers, and can be injected", () => {
  /** An apply that runs each edit twice, as React may run a reducer: an edit must give the same value both times. */
  const twice = () => {
    const results: [string, string][] = [];
    const apply = (edit: (d: FormDefinition) => FormDefinition) => {
      results.push([JSON.stringify(edit(current)), JSON.stringify(edit(current))]);
    };
    let current: FormDefinition;
    return {
      results,
      apply,
      set(def: FormDefinition) {
        current = def;
      },
    };
  };

  it("duplicates with an id made in the click handler", () => {
    const def = twoFields();
    const probe = twice();
    probe.set(def);
    render(<QuestionsPanel def={def} apply={probe.apply} selected={null} onSelect={() => {}} findings={[]} ruleCount={() => 0} />);
    fireEvent.click(screen.getByRole("button", { name: 'Duplicate "A"' }));
    const [first, second] = probe.results[0]!;
    expect(first).toBe(second);
  });

  it("gives an option without a value one in the handler", () => {
    const def = twoFields();
    def.blocks[0] = { kind: "field", id: "q_a", key: "a", type: "single-choice", label: "A", props: { options: [{ value: "", label: "Blank" }] } };
    const probe = twice();
    probe.set(def);
    render(<QuestionsPanel def={def} apply={probe.apply} selected="q_a" onSelect={() => {}} findings={[]} ruleCount={() => 0} />);
    fireEvent.change(screen.getByTestId("builder-option-0"), { target: { value: "Blank!" } });
    const [first, second] = probe.results[0]!;
    expect(first).toBe(second);
    expect(choiceOptions(JSON.parse(first).blocks[0] as FieldBlock)[0]!.value).not.toBe("");
  });

  it("uses an injected id generator", () => {
    setIdGenerator(counter());
    expect(newId("q")).toBe("q_1");
    expect(newOptionValue()).toBe("opt_2");
    expect(createField(twoFields(), { type: "short-text" }).id).toBe("q_3");
    setIdGenerator();
    expect(newId("q")).toMatch(/^q_[0-9a-z]{8}$/);
  });

  it("gives new choice fields fresh option values, never option_1", () => {
    setIdGenerator(counter());
    const values = (choiceOptions({ props: defaultProps("single-choice") } as FieldBlock)).map((o) => o.value);
    expect(values).toEqual(["opt_1", "opt_2"]);
    const again = choiceOptions({ props: defaultProps("multi-choice") } as FieldBlock).map((o) => o.value);
    expect(again).toEqual(["opt_3", "opt_4"]);
  });
});

describe("3. the coverage cache key", () => {
  // A plugin choice type whose validation reads an option prop besides value and label.
  const pickType = (name: string, accepts: (value: Json, field: FieldBlock) => boolean) =>
    registerFieldType({
      type: name,
      label: "Pick",
      category: "choice",
      value: { json: true },
      operators: ["eq", "answered", "empty"],
      a11y: { semantics: "group" },
      validate: (value, field) => (accepts(value, field) ? null : "Pick an available option."),
      samples: (field) => choiceOptions(field).map((o) => o.value),
    });
  const form = (type: string, disabled: boolean): FormDefinition => ({
    schemaVersion: 1,
    id: "f",
    title: "T",
    blocks: [
      {
        kind: "field",
        id: "q_a",
        key: "a",
        type,
        label: "A",
        props: { options: [{ value: "x", label: "X", disabled }, { value: "y", label: "Y" }] },
      },
      { kind: "field", id: "q_b", key: "b", type: "short-text", label: "B" },
    ],
    logic: [{ id: "r1", effect: "show", target: "q_b", when: { op: "eq", left: { field: "q_a" }, right: { value: "x" } } }],
    endings: [{ id: "default", title: "Thanks" }],
  });
  const neverFires = (a: Analysis) => a.findings.some((f) => f.ref?.kind === "rule" && f.ref.id === "r1");

  it("includes option props other than the label", () => {
    pickType("test-pick-props", (value, field) =>
      (field.props!.options as { value: string; disabled?: boolean }[]).some((o) => o.value === value && !o.disabled),
    );
    expect(neverFires(analyze(form("test-pick-props", true)))).toBe(true);
    expect(neverFires(analyze(form("test-pick-props", false)))).toBe(false);
  });

  it("changes when a field type is registered again", () => {
    pickType("test-pick-late", (value) => value === "y");
    expect(neverFires(analyze(form("test-pick-late", false)))).toBe(true);
    pickType("test-pick-late", (value) => value === "x" || value === "y");
    expect(neverFires(analyze(form("test-pick-late", false)))).toBe(false);
  });
});

describe("3. focus after Ctrl+Z inside the preview", () => {
  it("stays in the preview when its body remounts", () => {
    render(<FormBuilder defaultValue={twoFields()} />);
    fireEvent.change(screen.getByLabelText("Form title"), { target: { value: "Edited" } });
    fireEvent.change(screen.getByLabelText("A"), { target: { value: "wording" } });
    // A wording edit, then focus on a preview button and undo from there.
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_a"));
    fireEvent.change(screen.getByTestId("builder-field-label"), { target: { value: "A, reworded" } });
    const preview = screen.getByTestId("builder-preview");
    const submit = within(preview).getByRole("button", { name: /submit/i });
    submit.focus();
    expect(document.activeElement).toBe(submit);
    fireEvent.keyDown(submit, { key: "z", ctrlKey: true });
    expect(within(preview).getByLabelText("A")).toBeTruthy();
    expect(submit.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(preview.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(within(preview).getByRole("button", { name: /submit/i }));
  });
});

describe("A. removing a jump's last target in a form without endings", () => {
  it("drops the jump instead of pointing it at a missing ending", () => {
    const def: FormDefinition = {
      schemaVersion: 1,
      id: "f",
      title: "T",
      blocks: [
        { kind: "field", id: "q_a", key: "a", type: "yes-no", label: "A" },
        { kind: "field", id: "q_b", key: "b", type: "short-text", label: "B" },
        { kind: "field", id: "q_c", key: "c", type: "short-text", label: "C" },
      ],
      logic: [{ id: "j", effect: "jump", from: "q_a", to: "q_c", when: { op: "eq", left: { field: "q_a" }, right: { value: true } } }],
    };
    expect(parseForm(def).ok).toBe(true);
    const out = removeBlock(def, "q_c");
    expect(parseForm(out).ok).toBe(true);
    expect(out.logic).toBeUndefined();
  });

  it("still goes to the default ending when there is one", () => {
    const def = twoFields();
    def.endings = [{ id: "first", title: "First" }, { id: "default", title: "Default" }];
    def.logic = [{ id: "j", effect: "jump", from: "q_a", to: "q_b", when: { op: "answered", left: { field: "q_a" } } }];
    const out = removeBlock(def, "q_b");
    expect(parseForm(out).ok).toBe(true);
    expect(out.logic?.[0]).toMatchObject({ to: { ending: "default" } });
  });
});

describe("B. identifying hidden inputs on an anonymous form", () => {
  it("are left out of what the server stores, as the Anonymous hint says", () => {
    let def = addHidden(twoFields(), { name: "member", source: "url", identifying: true });
    def = addHidden(def, { name: "utm" });
    def = updateSettings(def, { anonymous: true });
    const result = validateSubmission(def, { answers: {}, hidden: { member: "m1", utm: "poster" } });
    expect(result.ok && result.submission.hidden).toEqual({ utm: "poster" });
    render(<FormBuilder defaultValue={def} defaultTab="settings" />);
    expect(screen.getByText(/Hidden inputs marked so are not stored/)).toBeTruthy();
  });
});

describe("4. custom type extensibility", () => {
  const checklist: FieldTypeEditor = {
    type: "test-checklist",
    label: "Checklist line",
    category: "advanced",
    defaultProps: () => ({ prompt: "Write it down" }),
    starterValue: () => "done",
    Panel: ({ field, set }) => (
      <button onClick={() => set({ props: { ...field.props, prompt: "Changed" } })}>Edit prompt</button>
    ),
    ConditionValue: ({ value, onChange }) => (
      <button onClick={() => onChange("other")}>{`Value: ${String(value)}`}</button>
    ),
  };
  registerFieldType({
    type: "test-checklist",
    label: "Manifest label",
    category: "text",
    value: { json: true },
    operators: ["eq", "answered", "empty"],
    a11y: { semantics: "control" },
    samples: () => ["done"],
  });

  it("limits and orders the palette, with editor labels", () => {
    const entries = paletteTypes({ palette: ["test-checklist", "yes-no", "short-text", "not-registered"], fieldEditors: [checklist] });
    expect(entries.map((e) => [e.type, e.label])).toEqual([
      ["test-checklist", "Checklist line"],
      ["yes-no", "Yes / no"],
      ["short-text", "Short text"],
    ]);
  });

  it("asks field editors for defaults and starter values first", () => {
    const def = twoFields();
    const field = createField(def, { type: "test-checklist" }, [checklist]);
    expect(field).toMatchObject({ label: "Checklist line", props: { prompt: "Write it down" } });
    expect(starterValue(field, "eq", [checklist])).toBe("done");
    expect(starterValue(field, "eq")).toBe("");
  });

  const Custom = ({ binding }: FieldRendererProps) => <p>{`custom renderer for ${binding.field.key}`}</p>;
  const registry = defaultRegistry.extend([{ type: "test-checklist", Component: Custom }]);

  const withChecklist = (): FormDefinition => {
    const def = twoFields();
    def.blocks.push({ kind: "field", id: "q_w", key: "w", type: "test-checklist", label: "Line", props: { prompt: "P" } });
    def.logic = [{ id: "r", effect: "show", target: "q_b", when: { op: "eq", left: { field: "q_w" }, right: { value: "done" } } }];
    def.blocks = [def.blocks[2]!, def.blocks[0]!, def.blocks[1]!];
    return def;
  };

  it("shows the type's own panel and logic value editor", () => {
    let last: FormDefinition | undefined;
    const { unmount } = render(
      <FormBuilder defaultValue={withChecklist()} fieldEditors={[checklist]} previewRegistry={registry} onChange={(d) => (last = d)} />,
    );
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_w"));
    fireEvent.click(screen.getByRole("button", { name: "Edit prompt" }));
    expect(last?.blocks[0]).toMatchObject({ props: { prompt: "Changed" } });
    unmount();
    render(
      <FormBuilder
        defaultValue={withChecklist()}
        fieldEditors={[checklist]}
        previewRegistry={registry}
        defaultTab="logic"
        onChange={(d) => (last = d)}
      />,
    );
    fireEvent.click(screen.getByTestId("builder-rule-r").querySelector("button[aria-expanded]")!);
    fireEvent.click(screen.getByRole("button", { name: "Value: done" }));
    expect(last?.logic?.[0]?.when).toMatchObject({ right: { value: "other" } });
  });

  it("limits the Add menu to the palette and the allowed block kinds", async () => {
    render(
      <FormBuilder
        defaultValue={twoFields()}
        palette={["test-checklist", "yes-no"]}
        fieldEditors={[checklist]}
        blockKinds={{ content: ["heading"], pageBreak: false }}
        previewRegistry={registry}
      />,
    );
    const trigger = screen.getAllByTestId("builder-add-block").at(-1)!;
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    expect(items).toEqual(["Checklist line", "Yes / no", "Heading"]);
  });

  it("renders custom field types in the preview with the given registry and validators", () => {
    render(
      <FormBuilder
        defaultValue={withChecklist()}
        fieldEditors={[checklist]}
        previewRegistry={registry}
        previewValidators={{ q_a: (v) => (v === "bad" ? "No bad answers." : null) }}
      />,
    );
    const preview = screen.getByTestId("builder-preview");
    expect(within(preview).getByText("custom renderer for w")).toBeTruthy();
    fireEvent.change(within(preview).getByLabelText("A"), { target: { value: "bad" } });
    fireEvent.click(within(preview).getByRole("button", { name: /submit/i }));
    expect(within(preview).getByText("No bad answers.")).toBeTruthy();
  });
});
