// Compiled against the built .d.ts with exactOptionalPropertyTypes on: a
// consumer's own optional values pass straight through.
import type { CreateFormOptions, FormDefinition, Json } from "@marktiderman/genesis-forms";
import { FieldRenderer, createRendererRegistry, useForm, type FieldRendererProps } from "@marktiderman/genesis-forms-react";

declare const definition: FormDefinition;
declare const maybe: { hidden?: Record<string, Json>; options?: CreateFormOptions; type?: string; rank?: number; onAdvance?: () => void };

function Text(props: FieldRendererProps) {
  return <input id={props.inputId} />;
}

export const registry = createRendererRegistry([{ type: maybe.type, rank: maybe.rank, test: undefined, Component: Text }]);

export function Example() {
  const engine = useForm(definition, { hidden: maybe.hidden, initialValues: undefined, clock: undefined });
  useForm(definition, maybe.options);
  return engine ? <FieldRenderer id="q" onAdvance={maybe.onAdvance} /> : null;
}
