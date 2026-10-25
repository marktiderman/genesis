/**
 * The built-in native field renderers, registered by kind in the same ranked registry the web
 * kit uses (`createRendererRegistry` from genesis-forms-react). A host adds a kind, or replaces
 * one, with `defaultRegistry.extend([{ type, rank: 10, Component }])`.
 */
import { useRef } from "react";
import { Text } from "react-native";
import { createRendererRegistry, useField, type FieldRendererProps, type RendererEntry, type RendererRegistry } from "@marktiderman/genesis-forms-react";
import type { FormEngine } from "@marktiderman/genesis-forms";
import { FieldChrome } from "../chrome";
import { useFormStyles } from "../styles";
import { MultiChoiceField, SingleChoiceField } from "./choice";
import { PhotoField } from "./photo";
import { CalculatedField, ConsentField, ScaleField, YesNoField } from "./scale";
import { DateField, NumberField, TextField } from "./text";

export { AnswerInput, keyboardHints, shapeDate, ANSWER_PLACEHOLDER, DateField, NumberField, TextField } from "./text";
export { MultiChoiceField, SingleChoiceField } from "./choice";
export { CalculatedField, ConsentField, ScaleField, YesNoField } from "./scale";
export { PhotoField, photoProblem } from "./photo";

export const builtInRenderers: RendererEntry[] = [
  { type: "short-text", Component: TextField },
  { type: "long-text", Component: (p) => <TextField {...p} multiline /> },
  { type: "email", Component: TextField },
  { type: "phone", Component: TextField },
  { type: "number", Component: NumberField },
  { type: "date", Component: DateField },
  { type: "single-choice", Component: SingleChoiceField },
  // A dropdown is a single pick; on a phone the list itself is the picker.
  { type: "dropdown", Component: SingleChoiceField },
  { type: "multi-choice", Component: MultiChoiceField },
  { type: "rating", Component: ScaleField },
  { type: "nps", Component: ScaleField },
  { type: "yes-no", Component: YesNoField },
  { type: "consent", Component: ConsentField },
  { type: "calculated", Component: CalculatedField },
  { type: "photo", Component: PhotoField },
];

/** The built-in renderers. `extend()` returns a new registry; `register()` changes this one for every form. */
export const defaultRegistry: RendererRegistry = createRendererRegistry(builtInRenderers);

const warned = new Set<string>();

/** A kind with no native renderer: the question and a clear note, never a blank step. */
function Unsupported(props: FieldRendererProps) {
  const s = useFormStyles();
  return (
    <FieldChrome props={props}>
      <Text style={s.hint}>This question can't be answered in the app yet.</Text>
    </FieldChrome>
  );
}

/** One field, drawn by whatever the registry resolves (or a note, logged once, when nothing does). */
export function NativeFieldRenderer({
  engine,
  registry,
  id,
  inputId,
  onAdvance,
}: {
  engine: FormEngine;
  registry: RendererRegistry;
  id: string;
  inputId: string;
  onAdvance?: (() => void) | undefined;
}) {
  const binding = useField(engine, id);
  const Component = registry.resolve(binding.field);
  const reported = useRef(false);
  if (!Component && !reported.current && !warned.has(binding.field.type)) {
    reported.current = true;
    warned.add(binding.field.type);
    console.warn(`[forms-native] No renderer for field type "${binding.field.type}"; it shows a note instead. Register one with registry.extend().`);
  }
  const Draw = Component ?? Unsupported;
  return <Draw engine={engine} binding={binding} inputId={inputId} onAdvance={onAdvance} />;
}
