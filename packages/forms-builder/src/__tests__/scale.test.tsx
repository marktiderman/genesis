// @feat:forms-builder
/**
 * The Logic and endings panel at scale: rendering must stay linear in the
 * number of rules (each rule's pickers mount their option lists only while
 * open), and editing one rule must not re-render the others.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FormDefinition, LogicRule } from "@marktiderman/genesis-forms";
import { FormBuilder } from "../index";

function bigForm(fields: number, rules: number): FormDefinition {
  const blocks: FormDefinition["blocks"] = [];
  for (let i = 0; i < fields; i++) {
    const kind = i % 3;
    blocks.push(
      kind === 0
        ? { kind: "field", id: `q_${i}`, key: `q${i}`, type: "rating", label: `Rating ${i}`, props: { max: 5 } }
        : kind === 1
          ? {
              kind: "field",
              id: `q_${i}`,
              key: `q${i}`,
              type: "single-choice",
              label: `Choice ${i}`,
              props: { options: [{ value: `a${i}`, label: "A" }, { value: `b${i}`, label: "B" }] },
            }
          : { kind: "field", id: `q_${i}`, key: `q${i}`, type: "short-text", label: `Text ${i}` },
    );
  }
  const logic: LogicRule[] = [];
  for (let r = 0; r < rules; r++) {
    const from = (r * 2) % (fields - 2);
    const at = from - (from % 3); // a rating field
    logic.push(
      r % 2 === 0
        ? { id: `r_${r}`, effect: "jump", from: `q_${at}`, to: `q_${at + 2}`, when: { op: "lte", left: { field: `q_${at}` }, right: { value: 2 } } }
        : { id: `r_${r}`, effect: "show", target: `q_${at + 2}`, when: { op: "gte", left: { field: `q_${at}` }, right: { value: 4 } } },
    );
  }
  return {
    schemaVersion: 1,
    id: "big",
    title: "Big",
    layout: { mode: "focus" },
    blocks,
    logic,
    endings: [{ id: "default", title: "Thanks" }, { id: "early", title: "Early" }],
  };
}

const time = (fn: () => void) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

describe("Logic and endings at scale", () => {
  it("renders 100 questions × 50 rules and edits one rule within budget", () => {
    const firstRender = time(() => render(<FormBuilder defaultValue={bigForm(100, 50)} defaultTab="logic" tabs={false} tab="logic" />));
    let ms = firstRender;
    // Generous: happy-dom is slow, and shared CI runners reach 7 s. Quadratic rendering took several times this.
    console.info(`[scale] first render: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(12000);
    const rules = screen.getAllByTestId(/^builder-rule-r_/);
    expect(rules).toHaveLength(50);
    // A closed picker holds only its chosen option, not every step of the form.
    expect(document.querySelectorAll('[role="option"]').length).toBe(0);
    const value = within(screen.getByTestId("builder-rule-r_1")).getByLabelText("Value");
    ms = time(() => {
      fireEvent.change(value, { target: { value: "3" } });
      fireEvent.blur(value);
    });
    console.info(`[scale] edit one rule of 50: ${ms.toFixed(0)} ms`);
    // Most of this is the path check, which a browser runs behind typing (it is deferred);
    // the test runs it at once. Rendering every picker's list made this several times longer.
    // Measured against this machine's own first render, so a slow CI runner doesn't fail it:
    // one edit must stay well under rendering the whole builder again.
    expect(ms).toBeLessThan(Math.max(1500, firstRender * 0.75));
    expect(document.querySelectorAll('[role="option"]').length).toBe(0);
  }, 30_000);

  it("renders 200 questions × 100 rules", () => {
    render(<FormBuilder defaultValue={bigForm(200, 100)} tabs={false} tab="logic" />);
    expect(screen.getAllByTestId(/^builder-rule-r_/)).toHaveLength(100);
    expect(document.querySelectorAll('[role="option"]').length).toBe(0);
  }, 60_000);
});

describe("a closed picker", () => {
  it("still shows its choice, and lists every option once opened", async () => {
    render(<FormBuilder defaultValue={bigForm(12, 2)} tabs={false} tab="logic" />);
    const target = within(screen.getByTestId("builder-rule-r_0")).getByLabelText("Go to");
    expect(target.textContent).toContain("Text 2");
    fireEvent.pointerDown(target, { button: 0, ctrlKey: false, pointerType: "mouse" });
    // The 11 steps after the jump's question, plus both endings.
    expect((await screen.findAllByRole("option")).length).toBe(11 + 2);
  });
});
