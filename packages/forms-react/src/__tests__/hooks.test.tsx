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

describe("useForm", () => {
  it("creates a new engine when the definition changes, and keeps it across re-renders", () => {
    const other = defineForm({ id: "u", title: "U", blocks: [f.shortText("c", { label: "C" })] });
    const seen: ReturnType<typeof useForm>[] = [];
    function Host({ def }: { def: Parameters<typeof useForm>[0] }) {
      seen.push(useForm(def));
      return null;
    }
    const { rerender } = render(<Host def={form} />);
    rerender(<Host def={form} />);
    expect(seen[1]).toBe(seen[0]);
    rerender(<Host def={other} />);
    expect(seen[2]).not.toBe(seen[0]);
    expect(seen[2]!.definition.id).toBe("u");
  });
});

describe("FormRuntime", () => {
  it("gives each form its own input ids, so two forms on a page never collide", () => {
    function IdProbe({ inputId }: FieldRendererProps) {
      return <input id={inputId} />;
    }
    const registry = createRendererRegistry([{ type: "short-text", Component: IdProbe }]);
    function One() {
      const engine = useForm(form);
      return (
        <FormRuntime engine={engine} registry={registry}>
          <FieldRenderer id="a" />
        </FormRuntime>
      );
    }
    const { container } = render(
      <>
        <One />
        <One />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("input"), (i) => i.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^gf-[a-zA-Z0-9]+-a$/);
  });
});
