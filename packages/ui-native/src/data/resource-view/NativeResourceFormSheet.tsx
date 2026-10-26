// The form sheet a NativeResourceView opens for New and Edit: Cancel and Save in the bar, the
// view's sections as grouped sections, native date and time pickers, choices as a segmented
// control (up to four) or a list. Text, number, switch and list fields are drawn by
// NativeResourceFormFieldRenderer, the same as NativeResourceForm. Read-only fields are text, never
// inputs, and a save sends only the view's writable keys.

import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import type { ResourceFormFieldDef } from "@marktiderman/genesis-core";
import { NativeButton } from "../../components/button";
import { NativeDatePicker, NativeTimePicker } from "../../components/date-time-picker";
import { NativeInlineAlert } from "../../components/inline-alert";
import { NativeLabel } from "../../components/label";
import { NativeSegmentedControl } from "../../components/segmented-control";
import { NativeSheet, NativeSheetScrollView } from "../../components/sheet";
import { NativeText } from "../../components/text";
import { NavBarSaveButton } from "../../layouts/nav-bar";
import { NativeResourceFormFieldRenderer } from "../NativeResourceFormField";
import { dateToDay, dayToDate, displayText, useNativeResourceViewMessages } from "./display";
import { shownFields, type NativeFormField } from "./mapping";
import type { SaveResult } from "./use-native-resource-view";

type Values = Record<string, unknown>;

export interface NativeResourceFormSheetProps {
  open: boolean;
  mode: "create" | "edit";
  title: string;
  fields: readonly NativeFormField[];
  /** The row being edited, or a create's starting values. */
  initial?: Values;
  onCancel: () => void;
  /** Saves; the sheet closes on `{ ok: true }` and shows the refusal otherwise. */
  onSave: (values: Values) => Promise<SaveResult>;
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
  onCancel,
  onSave,
  testID = "native-resource-form",
}: NativeResourceFormSheetProps) {
  const messages = useNativeResourceViewMessages();
  const defaults = useMemo(() => startValues(fields, initial), [fields, initial]);
  const form = useForm<Values>({ defaultValues: defaults });
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // A new row or another record: start from its values.
  useEffect(() => {
    if (open) {
      form.reset(defaults);
      setRefusal(null);
    }
  }, [open, defaults, form]);

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
      const result = await onSave(form.getValues());
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
        <NavBarSaveButton testID={`${testID}-save`} label={messages.common.save} loading={saving} onPress={() => void submit()} />
      </View>
      <NativeSheetScrollView contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        {refusal ? <NativeInlineAlert testID={`${testID}-refusal`} variant="destructive" description={refusal} /> : null}
        {sections.map((section, index) => (
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
  const error = f.formState.errors[field.key]?.message as string | undefined;
  if (field.readOnly) {
    return (
      <View testID={id} style={{ gap: 4 }} accessibilityLabel={`${field.label}, ${displayText(field.display, f.getValues(field.key), messages)}`}>
        <NativeLabel>{field.label}</NativeLabel>
        <NativeText testID={`${id}-value`} preset="body" className="text-muted-foreground">
          {displayText(field.display, f.getValues(field.key), messages)}
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
            <DateField kind={field.kind as "date" | "datetime"} value={input.value} onChange={input.onChange} testID={id} />
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
  testID,
}: {
  kind: "date" | "datetime";
  value: unknown;
  onChange: (value: unknown) => void;
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
        {messages.common.empty}
      </NativeButton>
    );
  }
  const set = (next: Date) => onChange(kind === "date" ? dateToDay(next) : next.toISOString());
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <NativeDatePicker testID={`${testID}-date`} value={date} onChange={set} />
      {kind === "datetime" ? <NativeTimePicker testID={`${testID}-time`} value={date} onChange={set} /> : null}
    </View>
  );
}
