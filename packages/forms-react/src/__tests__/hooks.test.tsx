import { describe, expect, it, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { defineForm, f } from "@marktiderman/genesis-forms";
import { createRendererRegistry, FieldRenderer, FormRuntime, useForm, type FieldRendererProps } from "../index";

afterEach(cleanup);

const form = defineForm({
  id: "t",
  title: "T",
  blocks: [f.shortText("a", { label: "A" }), f.shortText("b", { label: "B {{field:a|?}}" })],
});

const renders: Record<string, number> = {};
function Probe({ binding }: FieldRendererProps) {
  renders[binding.field.id] = (renders[binding.field.id] ?? 0) + 1;
  return <span data-testid={binding.field.id}>{binding.label}:{String(binding.value ?? "")}</span>;
}

describe("useField", () => {
  it("re-renders only the field whose value or label changed", () => {
    let engine!: ReturnType<typeof useForm>;
    function Host() {
      engine = useForm(form);
      return (
        <FormRuntime engine={engine} registry={createRendererRegistry([{ type: "short-text", Component: Probe }])}>
          <FieldRenderer id="a" />
          <FieldRenderer id="b" />
        </FormRuntime>
      );
    }
    render(<Host />);
    const before = { ...renders };
    act(() => engine.setValue("b", "x"));
    expect(renders.a).toBe(before.a);
    expect(renders.b).toBe((before.b ?? 0) + 1);
    act(() => engine.setValue("a", "hi"));
    expect(screen.getByTestId("b").textContent).toBe("B hi:x");
  });
});

describe("createRendererRegistry", () => {
  it("lets a higher rank override a built-in", () => {
    const Base = () => null;
    const Custom = () => null;
    const reg = createRendererRegistry([{ type: "email", Component: Base }]).extend([
      { type: "email", rank: 10, Component: Custom },
    ]);
    expect(reg.resolve({ kind: "field", id: "e", key: "e", type: "email", label: "E" })).toBe(Custom);
  });
});
