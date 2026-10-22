import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { ContentBlock, FieldBlock, FormDefinition, Json, Operator } from "@marktiderman/genesis-forms";
import type { BlockPatch, FieldTypeDefaults } from "./ops";
import { BUILT_IN_FIELD_EDITORS } from "./worksheet-editors";

export type Apply = (edit: (def: FormDefinition) => FormDefinition, coalesce?: string) => void;

/** What a field type's own settings panel gets. */
export interface FieldPanelProps {
  def: FormDefinition;
  field: FieldBlock;
  /**
   * Patch this field (`updateBlock`). Pass a function to build the patch from
   * the field as it is when the edit runs: `field` is the rendered one, so two
   * `set({ props: { ...field.props, … } })` calls in one handler would lose
   * the first. Pass `coalesce` for keystroke edits, so they undo as one step.
   */
  set: (patch: BlockPatch | ((latest: FieldBlock) => BlockPatch), coalesce?: string) => void;
  /** Merge into this field's latest props; `undefined` removes a prop. */
  setProps: (props: Record<string, Json | undefined>, coalesce?: string) => void;
  /** Apply any edit to the definition. */
  apply: Apply;
  /**
   * True when the builder is `readOnly`. The panel renders inside a disabled
   * `<fieldset>`, so native and Radix controls are already off and `set`,
   * `setProps` and `apply` do nothing; use this to hide your own add/remove
   * affordances or to swap an editor for a plain read-out.
   */
  readOnly?: boolean | undefined;
}

/** What a field type's own value editor in a logic condition gets. */
export interface ConditionValueProps {
  field: FieldBlock;
  op: Operator;
  value: Json;
  onChange: (value: Json) => void;
  /** True when the builder is `readOnly` (see `FieldPanelProps.readOnly`). */
  readOnly?: boolean | undefined;
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
  /**
   * The value a new condition on this field starts with, and the value it gets
   * when its operator changes. Without it, the built-in rule applies: a list
   * for `in`, one value otherwise (so a list is cut to its first item on `eq`).
   * A type whose value is itself a list must define it.
   */
  starterValue?: ((field: FieldBlock, op: Operator) => Json) | undefined;
}

/** Which non-question blocks the Add menu offers. Default: all of them. */
export interface BlockKinds {
  /** Headings and text: `false` for none, or the content types to offer. */
  content?: boolean | readonly ContentBlock["type"][] | undefined;
  pageBreak?: boolean | undefined;
}

/** What the panels need to know about the host's customisations. */
export interface BuilderConfig {
  palette?: readonly string[] | undefined;
  fieldEditors?: readonly FieldTypeEditor[] | undefined;
  blockKinds?: BlockKinds | undefined;
  /**
   * Show the form without changing it: every panel stays visible, but its
   * controls are off and add, remove, reorder and drag are hidden. Panels
   * rendered on their own read it from `BuilderConfigContext`.
   */
  readOnly?: boolean | undefined;
}

export const BuilderConfigContext = createContext<BuilderConfig>({});

export function useBuilderConfig(): BuilderConfig {
  return useContext(BuilderConfigContext);
}

/** The host's editor for a type, else the builder's own (the worksheet types have one). */
export function editorFor(config: BuilderConfig, type: string): FieldTypeEditor | undefined {
  return config.fieldEditors?.find((e) => e.type === type) ?? BUILT_IN_FIELD_EDITORS.find((e) => e.type === type);
}

/** The content types the Add menu and the Style select offer. */
export function contentTypes(kinds: BlockKinds | undefined): ContentBlock["type"][] {
  const content = kinds?.content ?? true;
  if (content === true) return ["heading", "text"];
  if (content === false) return [];
  return content.filter((t) => t === "heading" || t === "text");
}
