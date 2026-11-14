// The phone's twins of genesis-ui's form pieces beyond one input: NativeFieldArrayRenderer
// (repeating groups), NativeFileUploadField (pick and list files), NativeRelationField (a link's
// picker) and NativeWizardForm (a form in steps). Each follows the same ResourceFormFieldDef as
// the web and takes its rules from genesis-core (`@marktiderman/genesis-core/headless`:
// fieldArrayLimits, fileProblem, wizardStepFields; `useWizard`, `buildArrayItemDefaults`), so a
// form definition behaves the same on both platforms.

import { useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useFieldArray, useWatch, type Control, type FieldErrors, type UseFormReturn } from "react-hook-form";
import { titleCase, type ResourceFormFieldDef } from "@marktiderman/genesis-core";
import { buildArrayItemDefaults, useWizard, type WizardStep } from "@marktiderman/genesis-core/hooks";
import {
  fieldAccept,
  fieldArrayAddLabel,
  fieldArrayLimits,
  fileProblem,
  formatFileSize,
  wizardProgressLabel,
  wizardStepFields,
} from "@marktiderman/genesis-core/headless";
import { NativeButton } from "../components/button";
import { NativeCard } from "../components/card";
import { NativeImage } from "../components/image";
import { NativeLabel } from "../components/label";
import { NativeProgress } from "../components/progress";
import { NativeText } from "../components/text";
import { useGenesisModules, type GenesisFilePicker, type NativePickedFile } from "../native-modules";
import { NativeResourceFormFieldRenderer } from "./NativeResourceFormField";
import { NativeLinkPicker } from "./resource-view/NativeLinkPicker";
import type { NativeFormField } from "./resource-view/mapping";

// ── Repeating groups ─────────────────────────────────────────────────────

export interface NativeFieldArrayRendererProps {
  field: ResourceFormFieldDef;
  control: Control<Record<string, unknown>>;
  action: "create" | "edit";
  watchedValues?: Record<string, unknown>;
  /** The words. `{n}`: the item's number. `remove` is what a screen reader hears, `removeButton` the button's visible word. */
  labels?: { item?: string; remove?: string; removeButton?: string; add?: string };
}

/** A field of `type: "array"`: one card per item, each with the field's `arrayFields`, and Add / Remove within `arrayMin` and `arrayMax`. */
export function NativeFieldArrayRenderer({ field, control, action, watchedValues, labels = {} }: NativeFieldArrayRendererProps) {
  const { fields: items, append, remove } = useFieldArray({ control: control as unknown as Control, name: field.key });
  const subFields = field.arrayFields ?? [];
  const label = field.label ?? titleCase(field.key);
  const { canAdd, canRemove } = fieldArrayLimits(items.length, field);
  const fill = (template: string, n: number) => template.replace("{n}", String(n));
  return (
    <View testID={`field-array-${field.key}`} className="gap-2">
      <NativeLabel>{field.required ? `${label} *` : label}</NativeLabel>
      {field.description ? (
        <NativeText preset="caption" className="text-muted-foreground">
          {field.description}
        </NativeText>
      ) : null}
      {items.map((item, index) => (
        <NativeCard key={item.id} className="gap-3 p-4" testID={`field-array-${field.key}-${index}`}>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-medium text-muted-foreground">{fill(labels.item ?? "Item {n}", index + 1)}</Text>
            <NativeButton
              variant="ghost"
              size="sm"
              disabled={!canRemove}
              onPress={() => remove(index)}
              accessibilityLabel={fill(labels.remove ?? "Remove item {n}", index + 1)}
              testID={`field-array-${field.key}-${index}-remove`}
              textClassName="text-destructive"
            >
              {labels.removeButton ?? "Remove"}
            </NativeButton>
          </View>
          {subFields.map((sub) => (
            <NativeResourceFormFieldRenderer
              key={sub.key}
              field={{ ...sub, key: `${field.key}.${index}.${sub.key}` }}
              control={control}
              action={action}
              watchedValues={watchedValues}
            />
          ))}
        </NativeCard>
      ))}
      <NativeButton variant="outline" size="sm" disabled={!canAdd} onPress={() => append(buildArrayItemDefaults(subFields))} testID={`field-array-${field.key}-add`} className="self-start">
        {labels.add ?? fieldArrayAddLabel(label, field.arrayItemLabel)}
      </NativeButton>
    </View>
  );
}

// ── Files ────────────────────────────────────────────────────────────────

export interface NativeFileUploadFieldProps {
  field: ResourceFormFieldDef;
  value: NativePickedFile | NativePickedFile[] | null;
  onChange: (value: NativePickedFile | NativePickedFile[] | null) => void;
  disabled?: boolean;
  /** Opens the picker. Default `GenesisModules.filePicker`. */
  pickFiles?: GenesisFilePicker;
  /** The words. `pickFailed`: the picker rejected (a permission denied, a download that failed). */
  labels?: { choose?: string; chooseMore?: string; remove?: string; noPicker?: string; pickFailed?: string };
  error?: string;
  testID?: string;
}

/** A field of `type: "file"` or `"image"`: a button that opens the system picker, then the picked files with their size and a Remove each. */
export function NativeFileUploadField({ field, value, onChange, disabled, pickFiles, labels = {}, error, testID = `file-upload-${field.key}` }: NativeFileUploadFieldProps) {
  const { filePicker } = useGenesisModules();
  const pick = pickFiles ?? filePicker;
  const multiple = field.multiple ?? false;
  const accept = fieldAccept(field);
  const files = value ? (Array.isArray(value) ? value : [value]) : [];
  const [problems, setProblems] = useState<string[]>([]);
  // One picker at a time: a second tap while one is open does nothing (iOS throws on a second one).
  const picking = useRef(false);
  const [busy, setBusy] = useState(false);
  const label = field.label ?? titleCase(field.key);

  const choose = async () => {
    if (!pick || picking.current) return;
    picking.current = true;
    setBusy(true);
    let picked: NativePickedFile[];
    try {
      picked = await pick({ multiple, accept });
    } catch {
      // The picker's own error is for developers (E_NO_PERMISSIONS); the person gets a sentence.
      setProblems([labels.pickFailed ?? "Couldn't open the picker. Check that the app may use your photos and files, then try again."]);
      return;
    } finally {
      picking.current = false;
      setBusy(false);
    }
    if (!picked.length) return;
    const bad = picked.map((f) => fileProblem(f, { accept, maxSize: field.maxSize })).filter((p): p is string => p !== null);
    const good = picked.filter((f) => fileProblem(f, { accept, maxSize: field.maxSize }) === null);
    setProblems(bad);
    if (!good.length) return;
    onChange(multiple ? [...files, ...good] : good[0]!);
  };
  const removeAt = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    onChange(next.length === 0 ? null : multiple ? next : next[0]!);
  };

  return (
    <View testID={testID} className="gap-2">
      <NativeLabel>{field.required ? `${label} *` : label}</NativeLabel>
      {files.map((file, i) => (
        <View key={`${file.uri}-${i}`} testID={`${testID}-file-${i}`} className="flex-row items-center gap-3 rounded-md border border-border p-2">
          {file.type?.startsWith("image/") ? <NativeImage src={file.uri} width={40} height={40} className="rounded" /> : null}
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm text-foreground">
              {file.name}
            </Text>
            {file.size != null ? <Text className="text-xs text-muted-foreground">{formatFileSize(file.size)}</Text> : null}
          </View>
          <Pressable
            testID={`${testID}-remove-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`${labels.remove ?? "Remove"} ${file.name}`}
            disabled={disabled}
            onPress={() => removeAt(i)}
            hitSlop={8}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
          >
            <Text className="text-base text-muted-foreground">✕</Text>
          </Pressable>
        </View>
      ))}
      {multiple || files.length === 0 ? (
        <NativeButton
          variant="outline"
          disabled={disabled || !pick || busy}
          onPress={() => void choose()}
          testID={`${testID}-choose`}
          accessibilityHint={field.description}
          className="self-start"
        >
          {files.length && multiple ? (labels.chooseMore ?? "Add more") : (labels.choose ?? (field.type === "image" ? "Choose a photo" : "Choose a file"))}
        </NativeButton>
      ) : null}
      {!pick ? (
        <NativeText preset="caption" className="text-muted-foreground">
          {labels.noPicker ?? "No file picker is set up (GenesisModules.filePicker)."}
        </NativeText>
      ) : null}
      {[...problems, ...(error ? [error] : [])].map((p) => (
        <NativeText key={p} preset="caption" className="text-destructive" accessibilityRole="alert">
          {p}
        </NativeText>
      ))}
    </View>
  );
}

// ── A link's picker ──────────────────────────────────────────────────────

export interface NativeRelationFieldProps {
  field: ResourceFormFieldDef;
  value: unknown;
  /** The key as the field's `relation.keys` says: a string (`""` for none), or the row's own (`null` for none). */
  onChange: (value: string | number | null) => void;
  values?: Readonly<Record<string, unknown>>;
  error?: string;
  testID?: string;
}

/**
 * A field of `type: "relation"`: the linked resource's rows through the data provider, searched
 * and paged on the server. The same picker NativeResourceView's form uses (NativeLinkPicker),
 * fed from the field's `relation`.
 */
export function NativeRelationField({ field, value, onChange, values = {}, error, testID = `relation-${field.key}` }: NativeRelationFieldProps) {
  const relation = field.relation!;
  const label = field.label ?? titleCase(field.key);
  const native: NativeFormField = {
    key: field.key,
    label,
    kind: "link" as NativeFormField["kind"],
    display: "text" as NativeFormField["display"],
    required: field.required ?? false,
    readOnly: false,
    section: null,
    sectionTitle: null,
    ...(relation.missingLabel ? { missingLabel: relation.missingLabel } : {}),
    link: {
      resource: relation.resource,
      field: relation.valueField ?? "id",
      labelField: relation.labelField,
      ...(relation.searchFields ? { searchFields: relation.searchFields } : {}),
      ...(relation.orderBy ? { orderBy: { field: relation.orderBy.field, direction: relation.orderBy.direction ?? "asc", nulls: relation.orderBy.nulls } } : {}),
      filters: (_scope, formValues) => {
        const f = relation.filters;
        return typeof f === "function" ? f(formValues ?? {}) : (f ?? []);
      },
    },
  };
  return (
    <NativeLinkPicker
      field={native}
      value={value}
      values={values}
      error={error}
      testID={testID}
      onChange={(next) => onChange(relation.keys === "row" ? next : next === null ? "" : String(next))}
    />
  );
}

// ── Steps ────────────────────────────────────────────────────────────────

export interface NativeWizardFormProps {
  steps: WizardStep[];
  form: UseFormReturn<Record<string, unknown>>;
  fields: ResourceFormFieldDef[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isSaving: boolean;
  action: "create" | "edit";
  onInvalid?: (errors: FieldErrors) => void;
  renderField?: (field: ResourceFormFieldDef, control: UseFormReturn<Record<string, unknown>>["control"], action: "create" | "edit", watchedValues: Record<string, unknown>) => ReactNode;
  labels?: { back?: string; next?: string; create?: string; save?: string };
  testID?: string;
}

/** A form in steps (genesis-core's `useWizard`): the step's fields, its progress, Back and Next, and Create or Save on the last step. */
export function NativeWizardForm({ steps, form, fields, onSubmit, isSaving, action, onInvalid, renderField, labels = {}, testID = "wizard-form" }: NativeWizardFormProps) {
  const wizard = useWizard(steps, form);
  const watched = useWatch({ control: form.control }) as Record<string, unknown>;
  const stepFields = wizardStepFields(fields, wizard.currentStepDef.fields, watched);
  const progress = wizardProgressLabel(wizard);
  const next = async () => {
    if (wizard.isLast) await form.handleSubmit(onSubmit, onInvalid)();
    else await wizard.next();
  };
  return (
    <View testID={testID} className="gap-6">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">{progress.step}</Text>
          <Text className="text-sm text-muted-foreground">{progress.percent}</Text>
        </View>
        <NativeProgress value={wizard.progress * 100} testID={`${testID}-progress`} />
      </View>
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          {wizard.currentStepDef.title}
        </Text>
        {wizard.currentStepDef.description ? <Text className="text-sm text-muted-foreground">{wizard.currentStepDef.description}</Text> : null}
      </View>
      <View className="gap-4" key={wizard.currentStep}>
        {stepFields.map((f) =>
          renderField ? (
            <View key={f.key}>{renderField(f, form.control, action, watched)}</View>
          ) : (
            <NativeResourceFormFieldRenderer key={f.key} field={f} control={form.control} action={action} watchedValues={watched} />
          ),
        )}
      </View>
      <View className="flex-row justify-between pt-2">
        <NativeButton variant="outline" onPress={wizard.back} disabled={wizard.isFirst || isSaving} testID={`${testID}-back`}>
          {labels.back ?? "Back"}
        </NativeButton>
        <NativeButton onPress={() => void next()} disabled={isSaving} loading={isSaving} testID={`${testID}-next`}>
          {wizard.isLast ? (action === "create" ? (labels.create ?? "Create") : (labels.save ?? "Save")) : (labels.next ?? "Next")}
        </NativeButton>
      </View>
    </View>
  );
}
