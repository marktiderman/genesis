import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { ContentBlock, FieldBlock, FormDefinition, Json, Operator } from "@marktiderman/genesis-forms";
import type { BlockPatch, FieldTypeDefaults } from "./ops";

export type Apply = (edit: (def: FormDefinition) => FormDefinition, coalesce?: string) => void;

/** What a field type's own settings panel gets. */
export interface FieldPanelProps {
  def: FormDefinition;
  field: FieldBlock;
  /** Patch this field (`updateBlock`). Pass `coalesce` for keystroke edits, so they undo as one step. */
  set: (patch: BlockPatch, coalesce?: string) => void;
  /** Apply any edit to the definition. */
  apply: Apply;
}

/** What a field type's own value editor in a logic condition gets. */
export interface ConditionValueProps {
  field: FieldBlock;
  op: Operator;
  value: Json;
  onChange: (value: Json) => void;
}

/**
 * How the builder edits one field type, for types the builder does not know
 * (a worksheet's own types) or to replace its built-in editing of one. Each
 * part is optional; what is left out falls back to the built-in behaviour.
 */
export interface FieldTypeEditor extends FieldTypeDefaults {
  /** The field type, as registered with `registerFieldType`. */
  type: string;
  /** The name in the palette and the Type select. Default: the manifest's label. */
  label?: string | undefined;
  /** The palette group. Default: the manifest's category. */
  category?: string | undefined;
  /** Shown before the label in the palette. */
  icon?: ReactNode | undefined;
  /** Props for a new field of this type, so it is valid as soon as it is added. */
  defaultProps?: ((def: FormDefinition) => Record<string, Json> | undefined) | undefined;
  /** The type's settings, in place of the built-in ones (options, highest rating, longest answer). */
  Panel?: ComponentType<FieldPanelProps> | undefined;
  /** Edits the value a logic condition compares this field with. */
  ConditionValue?: ComponentType<ConditionValueProps> | undefined;
  /** The value a new condition on this field starts with. */
  starterValue?: ((field: FieldBlock, op: Operator) => Json) | undefined;
}

/** Which non-question blocks the Add menu offers. Default: all of them. */
export interface BlockKinds {
  /** Headings and text: `false` for none, or the content types to offer. */
  content?: boolean | ContentBlock["type"][] | undefined;
  pageBreak?: boolean | undefined;
}

/** What the panels need to know about the host's customisations. */
export interface BuilderConfig {
  palette?: readonly string[] | undefined;
  fieldEditors?: readonly FieldTypeEditor[] | undefined;
  blockKinds?: BlockKinds | undefined;
}

export const BuilderConfigContext = createContext<BuilderConfig>({});

export function useBuilderConfig(): BuilderConfig {
  return useContext(BuilderConfigContext);
}

export function editorFor(config: BuilderConfig, type: string): FieldTypeEditor | undefined {
  return config.fieldEditors?.find((e) => e.type === type);
}

/** The content types the Add menu and the Style select offer. */
export function contentTypes(kinds: BlockKinds | undefined): ContentBlock["type"][] {
  const content = kinds?.content ?? true;
  if (content === true) return ["heading", "text"];
  if (content === false) return [];
  return content.filter((t) => t === "heading" || t === "text");
}
