/** Regression tests for Blaze's re-review of PR #50 (0c9d79d..f71dde4): one block per finding. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { parseForm, registerFieldType, type FieldBlock, type FormDefinition, type LogicRule } from "@marktiderman/genesis-forms";
import type { FieldRendererProps } from "@marktiderman/genesis-forms-react";
import { defaultRegistry } from "@marktiderman/genesis-forms-web";
import {
  createContent,
  createField,
  defaultProps,
  FormBuilder,
  freshId,
  RuleEditor,
  setIdGenerator,
  withOptionValues,
  type FieldTypeEditor,
} from "../index";
import { valueForOperator } from "../logic";

afterEach(() => setIdGenerator());

/** A counter that starts over at 1, as a test's generator does. */
const counter = () => {
  let n = 0;
  return (prefix: string) => `${prefix}_${++n}`;
};

const form = (): FormDefinition => ({
  schemaVersion: 1,
  id: "f",
  title: "T",
  layout: { mode: "classic" },
  blocks: [
    { kind: "field", id: "q_1", key: "a", type: "short-text", label: "A" },
    { kind: "field", id: "q_2", key: "b", type: "short-text", label: "B" },
  ],
  endings: [{ id: "default", title: "Thanks" }],
});

registerFieldType({
  type: "test-rows",
  label: "Rows",
  category: "advanced",
  value: { json: true },
  operators: ["eq", "contains", "answered", "empty"],
  a11y: { semantics: "group" },
  samples: () => [["starter"]],
});
const Rows = ({ binding }: FieldRendererProps) => <p>{`rows ${binding.field.key}`}</p>;
const registry = defaultRegistry.extend([{ type: "test-rows", Component: Rows }]);

describe("1. a host id generator never makes a duplicate id", () => {
  it("skips ids already in the form", () => {
    setIdGenerator(counter());
    const def = form();
    expect(createField(def, { type: "short-text" }).id).toBe("q_3");
    setIdGenerator(counter());
    expect(createContent("heading", undefined, def).id).toBe("h_1");
    setIdGenerator(counter());
    expect(freshId("q", def)).toBe("q_3");
    expect(freshId("opt", ["opt_4", "opt_5"])).toBe("opt_6");
  });

  it("keeps option values unique among themselves", () => {
    setIdGenerator(() => "opt_same");
    const filled = withOptionValues([{ value: "opt_same", label: "A" }, { label: "B" }]);
    expect(new Set(filled.map((o) => o.value)).size).toBe(2);
    const props = defaultProps("single-choice")!;
    const values = (props.options as { value: string }[]).map((o) => o.value);
    expect(new Set(values).size).toBe(2);
  });

  it("duplicates and adds in a form whose ids the counter already used", () => {
    setIdGenerator(counter());
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={form()} onChange={(d) => (last = d)} />);
    fireEvent.click(screen.getByRole("button", { name: 'Duplicate "A"' }));
    expect(last?.blocks.map((b) => b.id)).toEqual(["q_1", "q_3", "q_2"]);
    expect(parseForm(last!).ok).toBe(true);
  });
});

describe("2. changing the operator keeps a custom type's list value", () => {
  const field: FieldBlock = { kind: "field", id: "q_r", key: "r", type: "test-rows", label: "Rows" };
  const editor: FieldTypeEditor = { type: "test-rows", starterValue: () => ["starter"] };

  it("asks the type's starterValue for the new operator", () => {
    expect(valueForOperator(field, "contains", ["starter"], [editor])).toEqual(["starter"]);
    expect(valueForOperator(field, "eq", undefined, [editor])).toEqual(["starter"]);
  });

  it("keeps the current value as it is when the editor has no starterValue", () => {
    expect(valueForOperator(field, "eq", ["a", "b"], [{ type: "test-rows" }])).toEqual(["a", "b"]);
  });

  it("still switches built-in values between a list and one value", () => {
    const choice: FieldBlock = { kind: "field", id: "q_c", key: "c", type: "single-choice", label: "C" };
    expect(valueForOperator(choice, "eq", ["x"], [editor])).toBe("x");
    expect(valueForOperator(choice, "in", "x", [editor])).toEqual(["x"]);
  });
});

describe("4. the previewRegistry docs", () => {
  it("tell hosts to extend defaultRegistry", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "FormBuilder.tsx"), "utf8");
    const doc = source.slice(source.lastIndexOf("/**", source.indexOf("previewRegistry?:")), source.indexOf("previewRegistry?:"));
    expect(doc).toMatch(/replaces `defaultRegistry`/);
    expect(doc).toMatch(/defaultRegistry\.extend\(/);
  });
});

describe("5. a jump with nowhere to go is not offered silently", () => {
  const noEndings = (): FormDefinition => ({
    schemaVersion: 1,
    id: "f",
    title: "T",
    blocks: [
      { kind: "content", id: "h_1", type: "heading", text: "Intro" },
      { kind: "field", id: "q_a", key: "a", type: "yes-no", label: "A" },
    ],
  });

  it("disables Jump rule and says why", () => {
    render(<FormBuilder defaultValue={noEndings()} defaultTab="logic" />);
    expect(screen.getByTestId("builder-add-rule-jump")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("builder-jump-hint").textContent).toMatch(/needs a later question or an ending/);
    expect(screen.getByTestId("builder-add-rule-show")).toHaveProperty("disabled", false);
  });

  it("explains a jump rule whose question has nothing after it", () => {
    const def = noEndings();
    const rule: LogicRule = { id: "j", effect: "jump", from: "q_a", to: "h_1", when: { op: "answered", left: { field: "q_a" } } };
    render(<RuleEditor def={def} rule={rule} onChange={() => {}} />);
    expect(screen.getByTestId("builder-jump-no-target").textContent).toMatch(/nowhere to go/);
    expect(screen.queryByText("Go to")).toBeNull();
  });
});

describe("6. a Panel's set reads the latest field", () => {
  it("applies several props edits made in one handler", () => {
    const editor: FieldTypeEditor = {
      type: "test-rows",
      label: "Rows",
      Panel: ({ field, set, setProps }) => (
        <button
          onClick={() => {
            setProps({ a: 1 });
            setProps({ b: 2 });
            set((latest) => ({ props: { ...latest.props, c: 3 } }));
            // A plain patch from the rendered field still works for one-off edits.
            void field;
          }}
        >
          Edit rows
        </button>
      ),
    };
    const def = form();
    def.blocks.push({ kind: "field", id: "q_r", key: "r", type: "test-rows", label: "Rows", props: { keep: true } });
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={def} fieldEditors={[editor]} previewRegistry={registry} onChange={(d) => (last = d)} />);
    fireEvent.click(screen.getByTestId("builder-block-toggle-q_r"));
    fireEvent.click(screen.getByRole("button", { name: "Edit rows" }));
    expect(last?.blocks.find((b) => b.id === "q_r")).toMatchObject({ props: { keep: true, a: 1, b: 2, c: 3 } });
  });
});
