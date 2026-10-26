// The form sheet a NativeResourceView opens for New and Edit: Cancel and Save in the bar, the
// view's sections as grouped sections, native date and time pickers, choices as a segmented
// control (up to four) or a list. Text, number, switch and list fields are drawn by
// NativeResourceFormFieldRenderer, the same as NativeResourceForm. Read-only fields are text, never
// inputs, and a save sends only the view's writable keys.

import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import type { ResourceFormFieldDef } from "@marktiderman/genesis-core";
import { NativeButton } from "../../components/button";
import { NativeDatePicker, NativeTimePicker } from "../../components/date-time-picker";
import { NativeInlineAlert } from "../../components/inline-alert";
import { NativeLabel } from "../../components/label";
import { NativeLoadingState } from "../../components/loading-state";
import { NativeSegmentedControl } from "../../components/segmented-control";
import { NativeSheet, NativeSheetScrollView } from "../../components/sheet";
import { NativeText } from "../../components/text";
import { NavBarSaveButton } from "../../layouts/nav-bar";
import { NativeResourceFormFieldRenderer } from "../NativeResourceFormField";
import { dateToDay, dayToDate, displayText, resolveZone, useDisplayTimeZones, useNativeResourceViewMessages } from "./display";
import { fill } from "./messages";
import { shownFields, type NativeFormField } from "./mapping";
import type { SaveResult } from "./use-native-resource-view";

type Values = Record<string, unknown>;

export interface NativeResourceFormSheetProps {
  open: boolean;
  mode: "create" | "edit";
  title: string;
  fields: readonly NativeFormField[];
  /** The row being edited (fetched by id), or a create's starting values. */
  initial?: Values;
  /** The record is still loading: a spinner instead of fields, and Save is off. */
  loading?: boolean;
  /** Which record the sheet holds; the form starts over when it (or `open`) changes. */
  recordKey?: string;
  onCancel: () => void;
  /** Saves with the fields the person changed; the sheet closes on `{ ok: true }` and shows the refusal otherwise. */
  onSave: (values: Values, dirty: ReadonlySet<string>) => Promise<SaveResult>;
  testID?: string;
}

const FIELD_TYPE: Partial<Record<NativeFormField["kind"], ResourceFormFieldDef["type"]>> = {
  text: "text",
  email: "email",
  url: "url",
  number: "number",
  textarea: "textarea",
  switch: "switch",
  select: "select",
};

/** Equal for the form's purposes: "" and null and undefined are all empty. */
function sameValue(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) => v === "" || v === null || v === undefined;
  if (empty(a) && empty(b)) return true;
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function startValues(fields: readonly NativeFormField[], initial: Values | undefined): Values {
  const values: Values = {};
  for (const field of fields) {
    const value = initial?.[field.key];
    values[field.key] = value ?? (field.kind === "switch" ? false : "");
  }
  return values;
}

export function NativeResourceFormSheet({
  open,
  mode,
  title,
  fields,
  initial,
  loading = false,
  recordKey,
  onCancel,
  onSave,
  testID = "native-resource-form",
}: NativeResourceFormSheetProps) {
  const messages = useNativeResourceViewMessages();
  const defaults = useMemo(() => startValues(fields, initial), [fields, initial]);
  const form = useForm<Values>({ defaultValues: defaults });
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Opened, another record, or the record arrived: start from its values. Not on every refetch,
  // which would wipe what the person typed.
  const latest = useRef(defaults);
  latest.current = defaults;
  // What the form started from, snapshotted at that reset: a later refetch moves `defaults` (someone
  // else's change), but "changed" means changed by this person since the sheet opened.
  const start = useRef(defaults);
  useEffect(() => {
    if (open && !loading) {
      start.current = latest.current;
      form.reset(start.current);
      setRefusal(null);
    }
  }, [open, loading, recordKey, form]);

  const values = form.watch();
  const sections = useMemo(() => {
    const out: { key: string; title: string | null; fields: NativeFormField[] }[] = [];
    for (const field of shownFields(fields, values)) {
      const last = out[out.length - 1];
      if (last && last.key === (field.section ?? "")) last.fields.push(field);
      else out.push({ key: field.section ?? "", title: field.sectionTitle, fields: [field] });
    }
    return out;
  }, [fields, values]);

  const submit = async () => {
    setSaving(true);
    setRefusal(null);
    form.clearErrors();
    try {
      // Changed against what the sheet started from (as react-hook-form's dirty fields, without
      // depending on which parts of formState were read during render).
      const now = form.getValues();
      const from = start.current;
      const dirty = new Set(fields.map((f) => f.key).filter((key) => !sameValue(now[key], from[key])));
      const result = await onSave(now, dirty);
      if (result.ok) return;
      for (const [key, message] of Object.entries(result.fields)) form.setError(key, { type: "server", message });
      if (result.message) setRefusal(result.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <NativeSheet open={open} onOpenChange={(next) => (next ? undefined : onCancel())} testID={testID}>
      <View
        testID={`${testID}-bar`}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 4 }}
      >
        <Pressable
          testID={`${testID}-cancel`}
          accessibilityRole="button"
          accessibilityLabel={messages.common.cancel}
          onPress={onCancel}
          hitSlop={8}
          className="min-h-[44px] justify-center px-3"
        >
          <Text className="text-base text-primary">{messages.common.cancel}</Text>
        </Pressable>
        <NativeText preset="body" accessibilityRole="header" className="font-semibold" numberOfLines={1}>
          {title}
        </NativeText>
        <NavBarSaveButton
          testID={`${testID}-save`}
          label={messages.common.save}
          loading={saving}
          disabled={loading}
          onPress={() => void submit()}
        />
      </View>
      <NativeSheetScrollView contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        {loading ? <NativeLoadingState fullScreen={false} label={messages.form.loading} testID={`${testID}-loading`} /> : null}
        {refusal ? <NativeInlineAlert testID={`${testID}-refusal`} variant="destructive" description={refusal} /> : null}
        {loading ? null : sections.map((section, index) => (
          <View key={section.key || `__first_${index}`} testID={`${testID}-section-${section.key || "main"}`} style={{ gap: 12 }}>
            {section.title ? (
              <NativeText preset="caption" accessibilityRole="header" className="uppercase text-muted-foreground">
                {section.title}
              </NativeText>
            ) : null}
            {section.fields.map((field) => (
              <FormField key={field.key} field={field} form={form} mode={mode} testID={`${testID}-field-${field.key}`} />
            ))}
          </View>
        ))}
      </NativeSheetScrollView>
    </NativeSheet>
  );
}

type Form = ReturnType<typeof useForm<Values>>;

function FormField({
  field,
  form: f,
  mode: m,
  testID: id,
}: {
  field: NativeFormField;
  form: Form;
  mode: "create" | "edit";
  testID: string;
}) {
  const messages = useNativeResourceViewMessages();
  const zones = useDisplayTimeZones();
  const error = f.formState.errors[field.key]?.message as string | undefined;
  if (field.readOnly) {
    // A link shows its raw id until batched relation labels arrive.
    const shown = displayText(field.display, f.getValues(field.key), messages, resolveZone(undefined, zones));
    return (
      <View testID={id} style={{ gap: 4 }} accessibilityLabel={`${field.label}, ${shown}`}>
        <NativeLabel>{field.label}</NativeLabel>
        <NativeText testID={`${id}-value`} preset="body" className="text-muted-foreground">
          {shown}
        </NativeText>
      </View>
    );
  }
  const type = FIELD_TYPE[field.kind];
  if (type) {
    const def: ResourceFormFieldDef = {
      key: field.key,
      label: field.label,
      type,
      required: field.required,
      ...(field.options ? { options: field.options } : {}),
      ...(field.max !== undefined ? { maxLength: field.max } : {}),
    };
    return (
      <View testID={id}>
        <NativeResourceFormFieldRenderer field={def} control={f.control} action={m} />
      </View>
    );
  }
  return (
    <Controller
      name={field.key}
      control={f.control}
      render={({ field: input }) => (
        <View testID={id} style={{ gap: 6 }}>
          <NativeLabel>{field.label}</NativeLabel>
          {field.kind === "segmented" ? (
            <NativeSegmentedControl
              testID={`${id}-segmented`}
              options={field.options ?? []}
              value={String(input.value ?? "")}
              onChange={input.onChange}
            />
          ) : (
            <DateField
              kind={field.kind as "date" | "datetime"}
              value={input.value}
              onChange={input.onChange}
              clearable={!field.required}
              label={field.label}
              testID={id}
            />
          )}
          {error ? (
            <NativeText preset="caption" className="text-destructive">
              {error}
            </NativeText>
          ) : null}
        </View>
      )}
    />
  );
}

/**
 * A day (`YYYY-MM-DD`, built from the picked date's own parts, never `toISOString`) or an instant
 * (an ISO timestamp). An empty value shows a button that starts it at today.
 */
function DateField({
  kind,
  value,
  onChange,
  clearable,
  label,
  testID,
}: {
  kind: "date" | "datetime";
  value: unknown;
  onChange: (value: unknown) => void;
  clearable: boolean;
  label: string;
  testID: string;
}) {
  const messages = useNativeResourceViewMessages();
  const date = kind === "date" ? dayToDate(value) : typeof value === "string" && value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return (
      <NativeButton
        variant="outline"
        size="sm"
        testID={`${testID}-set`}
        onPress={() => onChange(kind === "date" ? dateToDay(new Date()) : new Date().toISOString())}
      >
        {kind === "date" ? messages.form.pickDate : messages.form.pickDateTime}
      </NativeButton>
    );
  }
  const set = (next: Date) => onChange(kind === "date" ? dateToDay(next) : next.toISOString());
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <NativeDatePicker testID={`${testID}-date`} value={date} onChange={set} />
      {kind === "datetime" ? <NativeTimePicker testID={`${testID}-time`} value={date} onChange={set} /> : null}
      {clearable ? (
        <NativeButton variant="ghost" size="sm" testID={`${testID}-clear`} onPress={() => onChange(null)}>
          {fill(messages.form.clear, { label: label.toLowerCase() })}
        </NativeButton>
      ) : null}
    </View>
  );
}
