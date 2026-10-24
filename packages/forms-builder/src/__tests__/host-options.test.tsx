import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { parseForm, type FieldBlock, type FormDefinition } from "@marktiderman/genesis-forms";
import { analyze, emptyForm, FormBuilder, sampleHostOptions, setOptionsSource, type HostOptionList } from "../index";

const lists: HostOptionList[] = [
  {
    key: "coaches",
    label: "Coaches",
    description: "The practice's current coaches.",
    sample: [
      { value: "c1", label: "Ada Sample" },
      { value: "c2", label: "Sam Sample" },
    ],
  },
  { key: "classes", label: "Classes" },
];

const form = (): FormDefinition => ({
  ...emptyForm("f"),
  layout: { mode: "classic" },
  blocks: [
    {
      kind: "field",
      id: "q_coach",
      key: "coach",
      type: "single-choice",
      label: "Your coach",
      props: { options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    },
    { kind: "field", id: "q_why", key: "why", type: "short-text", label: "Why?" },
  ],
  logic: [{ id: "r1", when: { op: "eq", left: { field: "q_coach" }, right: { value: "a" } }, effect: "show", target: "q_why" }],
});
const field = (def: FormDefinition | undefined, id: string) => def?.blocks.find((b) => b.id === id) as FieldBlock;

describe("setOptionsSource", () => {
  it("to a list: typed options and the rules comparing them go", () => {
    const def = setOptionsSource(form(), "q_coach", { key: "coaches" });
    expect(field(def, "q_coach").props).toEqual({ optionsFrom: { source: "host", key: "coaches" } });
    expect(def.logic ?? []).toEqual([]);
    expect(parseForm(def).ok).toBe(true);
    // The same list again changes nothing.
    expect(setOptionsSource(def, "q_coach", { key: "coaches" })).toBe(def);
  });

  it("back to typed: the list goes and the new options are set", () => {
    const hosted = setOptionsSource(form(), "q_coach", { key: "coaches" });
    const def = setOptionsSource(hosted, "q_coach", { options: [{ value: "x", label: "X" }] });
    expect(field(def, "q_coach").props).toEqual({ options: [{ value: "x", label: "X" }] });
  });
});

describe("sampleHostOptions", () => {
  it("maps each list's samples by key", () => {
    expect(sampleHostOptions(lists)).toEqual({ coaches: lists[0]!.sample, classes: [] });
    expect(sampleHostOptions(undefined)).toBeUndefined();
  });
});

describe("analyze with host lists", () => {
  it("warns when a question uses a list the app doesn't offer", () => {
    const def = setOptionsSource(form(), "q_coach", { key: "rooms" });
    const messages = analyze(def, { hostOptions: lists }).findings.map((f) => f.message);
    expect(messages.some((m) => m.includes('"rooms"'))).toBe(true);
    const fine = setOptionsSource(form(), "q_coach", { key: "coaches" });
    expect(analyze(fine, { hostOptions: lists }).findings.filter((f) => f.ref?.id === "q_coach")).toEqual([]);
  });

  it("explores a required question from the app with its samples, so the ending is reachable", () => {
    let def = setOptionsSource(form(), "q_coach", { key: "coaches" });
    def = { ...def, blocks: def.blocks.map((b) => (b.id === "q_coach" ? { ...b, required: true } : b)) };
    const report = analyze(def, { hostOptions: lists }).coverage!;
    expect(report.unsampledFields).toEqual([]);
    expect(report.pathsExplored).toBeGreaterThan(0);
  });
});

describe("Options: Typed here | From the app", () => {
  const open = (id: string) => fireEvent.click(screen.getByTestId(`builder-block-toggle-${id}`));

  it("isn't offered when the host has no lists", () => {
    render(<FormBuilder defaultValue={form()} />);
    open("q_coach");
    expect(screen.queryByTestId("builder-options-source")).toBeNull();
    expect(screen.getByTestId("builder-option-0")).toBeTruthy();
  });

  it("switches to a list, shows its samples in the preview, and back", () => {
    let last: FormDefinition | undefined;
    render(<FormBuilder defaultValue={form()} hostOptions={lists} onChange={(d) => (last = d)} />);
    open("q_coach");
    fireEvent.click(within(screen.getByTestId("builder-options-source")).getByText("From the app"));
    expect(field(last, "q_coach").props).toEqual({ optionsFrom: { source: "host", key: "coaches" } });
    expect(screen.queryByTestId("builder-option-0")).toBeNull();
    expect(screen.getByText("The practice's current coaches.")).toBeTruthy();
    expect(screen.getByTestId("builder-options-host-note").textContent).toContain("Ada Sample, Sam Sample");
    const preview = screen.getByTestId("builder-preview");
    expect(within(preview).getByText("Ada Sample")).toBeTruthy();
    expect(within(preview).getByText("Sam Sample")).toBeTruthy();

    fireEvent.click(within(screen.getByTestId("builder-options-source")).getByText("Typed here"));
    const props = field(last, "q_coach").props!;
    expect(props.optionsFrom).toBeUndefined();
    expect((props.options as { label: string }[]).map((o) => o.label)).toEqual(["Option 1", "Option 2"]);
    expect(screen.getByTestId("builder-option-0")).toBeTruthy();
  });

  it("names a list this app doesn't offer", () => {
    const def = setOptionsSource(form(), "q_coach", { key: "rooms" });
    render(<FormBuilder defaultValue={def} />);
    open("q_coach");
    expect(within(screen.getByTestId("builder-options-source")).getByText("From the app")).toBeTruthy();
    expect(screen.getByTestId("builder-options-host-note").textContent).toContain("doesn't offer this list");
  });
});
