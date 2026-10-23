import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { parseForm, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";
import {
  chosenOutputs,
  clearOutputs,
  emptyForm,
  FormBuilder,
  outputsFor,
  setOutput,
  type OutputTarget,
} from "../index";

const outputs: OutputTarget[] = [
  { id: "profile-type", label: "Type on their profile", group: "Profile", types: ["short-text", "single-choice"], prop: "record_column", value: "type" },
  { id: "profile-nickname", label: "Nickname on their profile", group: "Profile", types: ["short-text"], prop: "record_column", value: "nickname" },
  {
    id: "task",
    label: "A task on their list",
    description: "Each row becomes a task.",
    group: "Actions",
    types: ["table", "list", "short-text"],
    prop: "creates_task",
    value: { from: "commit", due_in_days: 7 },
    multiple: true,
  },
  { id: "anywhere", label: "The activity log", prop: "logs_to", value: "activity" },
];

const form = (): FormDefinition => ({
  ...emptyForm("f"),
  blocks: [
    { kind: "field", id: "q_a", key: "a", type: "short-text", label: "Your type" },
    { kind: "field", id: "q_b", key: "b", type: "yes-no", label: "Agree?" },
    { kind: "field", id: "q_c", key: "c", type: "short-text", label: "Something else" },
  ],
});
const field = (def: FormDefinition | undefined, id: string) => def?.blocks.find((b) => b.id === id) as FieldBlock;

describe("output ops", () => {
  it("lists the targets that apply to a type", () => {
    expect(outputsFor(outputs, "short-text").map((t) => t.id)).toEqual(["profile-type", "profile-nickname", "task", "anywhere"]);
    expect(outputsFor(outputs, "yes-no").map((t) => t.id)).toEqual(["anywhere"]);
    expect(outputsFor(outputs, "table").map((t) => t.id)).toEqual(["task", "anywhere"]);
  });

  it("sets and clears, with different props side by side and one value per prop", () => {
    let def = setOutput(form(), "q_a", outputs[0]!, true);
    def = setOutput(def, "q_a", outputs[2]!, true);
    expect(field(def, "q_a").props).toEqual({ record_column: "type", creates_task: { from: "commit", due_in_days: 7 } });
    def = setOutput(def, "q_a", outputs[1]!, true);
    expect(chosenOutputs(field(def, "q_a"), outputs).map((t) => t.id)).toEqual(["profile-nickname", "task"]);
    def = setOutput(def, "q_a", outputs[2]!, false);
    expect(field(def, "q_a").props).toEqual({ record_column: "nickname" });
    def = clearOutputs(def, "q_a", outputs);
    expect(field(def, "q_a").props).toBeUndefined();
    expect(parseForm(def).ok).toBe(true);
  });

  it("moves a single-use target from another question, but shares a multiple one", () => {
    let def = setOutput(form(), "q_a", outputs[0]!, true);
    def = setOutput(def, "q_c", outputs[0]!, true);
    expect(field(def, "q_a").props).toBeUndefined();
    expect(field(def, "q_c").props).toEqual({ record_column: "type" });
    def = setOutput(setOutput(def, "q_a", outputs[2]!, true), "q_c", outputs[2]!, true);
    expect(field(def, "q_a").props?.creates_task).toBeTruthy();
    expect(field(def, "q_c").props?.creates_task).toBeTruthy();
  });

  it("leaves props it didn't set alone", () => {
    const def: FormDefinition = { ...form(), blocks: [{ ...field(form(), "q_a"), props: { record_column: "custom", maxLength: 20 } }] };
    expect(field(clearOutputs(def, "q_a", outputs), "q_a").props).toEqual({ record_column: "custom", maxLength: 20 });
  });
});

describe("Saves to in the question inspector", () => {
  const open = (id: string) => fireEvent.click(screen.getByTestId(`builder-block-toggle-${id}`));

  it("shows the targets for the field's type, grouped", () => {
    render(<FormBuilder defaultValue={form()} outputs={outputs} />);
    open("q_a");
    const section = screen.getByTestId("builder-field-outputs");
    expect(within(section).getByRole("group", { name: "Profile" })).toBeTruthy();
    expect(within(section).getByRole("group", { name: "Actions" })).toBeTruthy();
    expect(within(section).getByRole("checkbox", { name: "Type on their profile" })).toBeTruthy();
    expect(within(section).getByRole("checkbox", { name: "A task on their list" }).getAttribute("aria-describedby")).toBeTruthy();
    expect(within(section).getByText("Each row becomes a task.")).toBeTruthy();
    expect(within(section).getByRole("checkbox", { name: "Nowhere else" }).getAttribute("data-state")).toBe("checked");
    open("q_b");
    const yesNo = screen.getByTestId("builder-field-outputs");
    expect(within(yesNo).queryByRole("checkbox", { name: "Type on their profile" })).toBeNull();
    expect(within(yesNo).getByRole("checkbox", { name: "The activity log" })).toBeTruthy();
  });

  it("has no section without targets for the type", () => {
    render(<FormBuilder defaultValue={form()} outputs={[outputs[0]!]} />);
    open("q_b");
    expect(screen.queryByTestId("builder-field-outputs")).toBeNull();
  });

  it("sets, combines and clears targets, and the preview notes them", () => {
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={{ ...form(), layout: { mode: "classic" } }} outputs={outputs} onChange={(d) => (last = d)} />);
    open("q_a");
    fireEvent.click(screen.getByTestId("builder-output-profile-type"));
    fireEvent.click(screen.getByTestId("builder-output-task"));
    expect(field(last, "q_a").props).toEqual({ record_column: "type", creates_task: { from: "commit", due_in_days: 7 } });
    expect(screen.getByTestId("builder-output-none").getAttribute("data-state")).toBe("unchecked");
    expect(screen.getByTestId("builder-preview-output-q_a").textContent).toBe("→ goes to Type on their profile and A task on their list");
    expect(screen.queryByTestId("builder-preview-output-q_b")).toBeNull();

    fireEvent.click(screen.getByTestId("builder-output-profile-nickname"));
    expect(field(last, "q_a").props?.record_column).toBe("nickname");
    expect(screen.getByTestId("builder-output-profile-type").getAttribute("data-state")).toBe("unchecked");

    fireEvent.click(screen.getByTestId("builder-output-none"));
    expect(field(last, "q_a").props).toBeUndefined();
    expect(screen.queryByTestId("builder-preview-output-q_a")).toBeNull();
  });

  it("says when choosing a target moves it from another question", () => {
    const def = setOutput(form(), "q_a", outputs[0]!, true);
    render(<FormBuilder defaultValue={def} outputs={outputs} />);
    open("q_c");
    expect(screen.getByText("Now saved from “Your type”; choosing it here moves it.")).toBeTruthy();
  });

  it("keeps targets the new type accepts when the type changes", async () => {
    const def = setOutput(setOutput(form(), "q_a", outputs[0]!, true), "q_a", outputs[2]!, true);
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={def} outputs={outputs} onChange={(d) => (last = d)} />);
    open("q_a");
    // Single choice accepts the profile target, not the task one.
    fireEvent.click(screen.getByLabelText("Type"));
    fireEvent.click(await screen.findByRole("option", { name: "Single choice" }));
    const props = field(last, "q_a").props!;
    expect(props.record_column).toBe("type");
    expect(props.creates_task).toBeUndefined();
    expect(Array.isArray(props.options)).toBe(true);
  });
});
