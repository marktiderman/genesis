import { useResourceForm, titleCase } from "@marktiderman/genesis-core";
import type { UseResourceFormOptions, ResourceFormFieldDef } from "@marktiderman/genesis-core";
import type { UseFormReturn } from "react-hook-form";
import * as React from "react";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeAlert, NativeAlertDescription, NativeAlertTitle } from "../components/alert";
import { NativeButton } from "../components/button";
import { NativeSeparator } from "../components/separator";
import { NativeText } from "../components/text";
import { NativeResourceFormFieldRenderer } from "./NativeResourceFormField";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NativeResourceFormProps {
  resource: string;
  action: "create" | "edit";
  fields?: ResourceFormFieldDef[];
  item?: Record<string, unknown>;
  listData?: Record<string, unknown>[];
  title?: string;
  layout?: "inline" | "screen";
  onSuccess?: (data: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
  renderForm?: (
    form: UseFormReturn<Record<string, unknown>>,
    fields: ResourceFormFieldDef[],
  ) => ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function NativeResourceForm({
  resource,
  action,
  fields,
  item,
  listData,
  title,
  layout = "screen",
  onSuccess,
  onError,
  renderForm,
}: NativeResourceFormProps) {
  const options: UseResourceFormOptions = {
    resource,
    action,
    initialData: item,
    fields,
    listData,
    onSuccess,
    onError,
    prefillFromUrl: false,
    validationMode: "onSubmit",
  };

  const { form, resolvedFields, onSubmit, isSaving } = useResourceForm(options);

  const resolvedTitle =
    title ?? (action === "create" ? `Create ${titleCase(resource)}` : `Edit ${titleCase(resource)}`);

  const submitLabel = action === "create" ? "Create" : "Save";

  const values = form.watch();
  const rootError = form.formState.errors.root?.message;

  // Filter and group fields — memoized together to avoid cascading re-creation
  const { groups, firstFieldKey } = React.useMemo(() => {
    const visible = resolvedFields.filter(
      (field) => field.visible == null || field.visible(values) !== false,
    );
    const result: Array<{ group: string | undefined; fields: ResourceFormFieldDef[] }> = [];
    for (const field of visible) {
      const lastGroup = result[result.length - 1];
      if (lastGroup && lastGroup.group === field.group) {
        lastGroup.fields.push(field);
      } else {
        result.push({ group: field.group, fields: [field] });
      }
    }
    const first = visible.find((f) => !f.hidden && f.type !== "hidden");
    return { groups: result, firstFieldKey: first?.key ?? null };
  }, [resolvedFields, values]);

  const formContent = renderForm ? (
    renderForm(form, resolvedFields)
  ) : (
    <View style={{ gap: 16 }}>
      {rootError ? (
        <NativeAlert variant="destructive">
          <NativeAlertTitle variant="destructive">Error</NativeAlertTitle>
          <NativeAlertDescription variant="destructive">
            {rootError}
          </NativeAlertDescription>
        </NativeAlert>
      ) : null}

      {groups.map((group, groupIndex) => (
        <View key={group.group ?? `__ungrouped_${groupIndex}`} style={{ gap: 12 }}>
          {group.group ? (
            <View style={{ gap: 8 }}>
              {groupIndex > 0 ? <NativeSeparator /> : null}
              <NativeText preset="body-sm" className="text-muted-foreground">
                {group.group}
              </NativeText>
            </View>
          ) : groupIndex > 0 ? (
            <NativeSeparator />
          ) : null}

          {group.fields.map((field) => (
              <NativeResourceFormFieldRenderer
                key={field.key}
                field={field}
                control={form.control}
                action={action}
                autoFocus={field.key === firstFieldKey}
                watchedValues={values}
              />
          ))}
        </View>
      ))}

      <NativeButton onPress={onSubmit} disabled={isSaving} loading={isSaving}>
        {isSaving ? "Saving..." : submitLabel}
      </NativeButton>
    </View>
  );

  if (layout === "inline") {
    return (
      <View style={{ gap: 16 }}>
        <NativeText preset="h3">{resolvedTitle}</NativeText>
        {formContent}
      </View>
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <NativeText preset="h3">{resolvedTitle}</NativeText>
        {formContent}
      </ScrollView>
    </SafeAreaView>
  );
}

export { NativeResourceForm };
