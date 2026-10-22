// Compiled against the built .d.ts with exactOptionalPropertyTypes on: a
// host's own optional props pass straight through to <FormBuilder>.
import type { ReactNode, Ref } from "react";
import type { FieldValidator, FormDefinition } from "@marktiderman/genesis-forms";
import type { RendererRegistry } from "@marktiderman/genesis-forms-react";
import type { FormBrand } from "@marktiderman/genesis-forms-web";
import {
  FindingsList,
  FormBuilder,
  type Analysis,
  type BlockKinds,
  type BuilderActionsState,
  type BuilderTab,
  type FieldTypeEditor,
  type Finding,
  type FormBuilderHandle,
} from "@marktiderman/genesis-forms-builder";

declare const definition: FormDefinition;
declare const maybe: {
  onChange?: (value: FormDefinition) => void;
  onAnalysis?: (analysis: Analysis, value: FormDefinition) => void;
  actions?: (value: FormDefinition, analysis: Analysis, state: BuilderActionsState) => ReactNode;
  ref?: Ref<FormBuilderHandle>;
  palette?: readonly string[];
  fieldEditors?: readonly FieldTypeEditor[];
  blockKinds?: BlockKinds;
  previewRegistry?: RendererRegistry;
  previewValidators?: Record<string, FieldValidator>;
  brand?: FormBrand;
  previewHidden?: Record<string, string | number | boolean>;
  showJson?: boolean;
  readOnly?: boolean;
  defaultTab?: BuilderTab;
  className?: string;
  onJump?: (f: Finding) => void;
};

export const builder = (
  <FormBuilder
    defaultValue={definition}
    onChange={maybe.onChange}
    onAnalysis={maybe.onAnalysis}
    actions={maybe.actions}
    ref={maybe.ref}
    palette={maybe.palette}
    fieldEditors={maybe.fieldEditors}
    blockKinds={maybe.blockKinds}
    previewRegistry={maybe.previewRegistry}
    previewValidators={maybe.previewValidators}
    brand={maybe.brand}
    previewHidden={maybe.previewHidden}
    showJson={maybe.showJson}
    readOnly={maybe.readOnly}
    defaultTab={maybe.defaultTab}
    className={maybe.className}
  />
);

export const findings = <FindingsList findings={[]} onJump={maybe.onJump} />;

// Field-type editors, their panels and block patches: `undefined` means "leave out" or "remove".
import type { BlockPatch, FieldPanelProps, BlockKinds as Kinds } from "@marktiderman/genesis-forms-builder";
import type { FieldBlock, Json, Operator } from "@marktiderman/genesis-forms";

declare const maybeEditor: {
  label?: string;
  category?: string;
  icon?: ReactNode;
  defaultProps?: (def: FormDefinition) => Record<string, Json> | undefined;
  starterValue?: (field: FieldBlock, op: Operator) => Json;
};

export const editor: FieldTypeEditor = {
  type: "table",
  label: maybeEditor.label,
  category: maybeEditor.category,
  icon: maybeEditor.icon,
  defaultProps: maybeEditor.defaultProps,
  starterValue: maybeEditor.starterValue,
  Panel: undefined,
  ConditionValue: undefined,
};

export const panel = ({ field, set, setProps }: FieldPanelProps) => {
  set({ description: undefined });
  set({ props: field.props });
  set((latest) => ({ props: latest.props, required: undefined }));
  setProps({ max: undefined, min: 1 });
  return null;
};

const contentTypes = ["heading"] as const;
export const kinds: Kinds = { content: contentTypes, pageBreak: undefined };
export const patch: BlockPatch = { label: "Q", placeholder: undefined };
