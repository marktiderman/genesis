import { titleCase } from "@marktiderman/genesis-core";
import type { ResourceFormFieldDef } from "@marktiderman/genesis-core";
import { Controller, type Control } from "react-hook-form";
import { Pressable, View, type TextInputProps } from "react-native";
import { NativeCheckbox } from "../components/checkbox";
import { NativeInput } from "../components/input";
import { NativeLabel } from "../components/label";
import {
  NativeSelect,
  NativeSelectContent,
  NativeSelectItem,
  NativeSelectTrigger,
} from "../components/select";
import { NativeSwitch } from "../components/switch";
import { NativeText } from "../components/text";
import { NativeTextarea } from "../components/textarea";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NativeResourceFormFieldRendererProps {
  field: ResourceFormFieldDef;
  control: Control<Record<string, unknown>>;
  action: "create" | "edit";
  autoFocus?: boolean;
  watchedValues?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Static lookup maps (module-scoped to avoid re-creation on each render)
// ---------------------------------------------------------------------------

const KEYBOARD_TYPE_MAP: Record<string, "default" | "email-address" | "url" | "phone-pad"> = {
  email: "email-address",
  url: "url",
  tel: "phone-pad",
  text: "default",
  date: "default",
};

const AUTO_CAPITALIZE_MAP: Record<string, "none" | "sentences" | "words" | "characters"> = {
  email: "none",
  url: "none",
  tel: "none",
  text: "sentences",
  date: "none",
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function NativeResourceFormFieldRenderer({
  field,
  control,
  action,
  autoFocus,
  watchedValues,
}: NativeResourceFormFieldRendererProps) {
  const label = field.label ?? titleCase(field.key);
  const fieldType = field.type ?? "text";
  const isReadOnly = action === "edit" && !!field.readOnlyOnEdit;
  const isDisabled =
    isReadOnly ||
    (watchedValues ? field.disabled?.(watchedValues) === true : false);

  // Hidden fields — return null (native has no hidden input concept)
  if (field.hidden || fieldType === "hidden") {
    return null;
  }

  return (
    <Controller
      name={field.key}
      control={control}
      render={({ field: f, fieldState }) => {
        const errorMessage = fieldState.error?.message;

        // ------------------------------------------------------------------
        // Switch
        // ------------------------------------------------------------------
        if (fieldType === "switch") {
          return (
            <View className="gap-1.5">
              <Pressable
                className="flex-row items-center justify-between rounded-lg border border-border p-4"
                onPress={() => !isDisabled && f.onChange(!f.value)}
                accessibilityRole="switch"
                accessibilityState={{ checked: !!f.value, disabled: isDisabled }}
              >
                <NativeLabel disabled={isDisabled}>{label}</NativeLabel>
                <NativeSwitch
                  checked={!!f.value}
                  onCheckedChange={f.onChange}
                  disabled={isDisabled}
                />
              </Pressable>
              {field.description ? (
                <NativeText preset="caption" className="text-muted-foreground">
                  {field.description}
                </NativeText>
              ) : null}
              {errorMessage ? (
                <NativeText preset="caption" className="text-destructive">
                  {errorMessage}
                </NativeText>
              ) : null}
            </View>
          );
        }

        // ------------------------------------------------------------------
        // Checkbox
        // ------------------------------------------------------------------
        if (fieldType === "checkbox") {
          return (
            <View className="gap-1.5">
              <Pressable
                className="flex-row items-center gap-3"
                onPress={() => !isDisabled && f.onChange(!f.value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!f.value, disabled: isDisabled }}
              >
                <NativeCheckbox
                  checked={!!f.value}
                  onCheckedChange={f.onChange}
                  disabled={isDisabled}
                />
                <NativeLabel disabled={isDisabled}>{label}</NativeLabel>
              </Pressable>
              {field.description ? (
                <NativeText preset="caption" className="text-muted-foreground">
                  {field.description}
                </NativeText>
              ) : null}
              {errorMessage ? (
                <NativeText preset="caption" className="text-destructive">
                  {errorMessage}
                </NativeText>
              ) : null}
            </View>
          );
        }

        // ------------------------------------------------------------------
        // Select
        // ------------------------------------------------------------------
        if (fieldType === "select" && field.options) {
          return (
            <View className="gap-1.5">
              <NativeLabel disabled={isDisabled}>{label}</NativeLabel>
              <NativeSelect
                value={f.value != null ? String(f.value) : ""}
                onValueChange={f.onChange}
                defaultValue=""
              >
                <NativeSelectTrigger
                  placeholder={
                    field.placeholder ?? `Select ${label.toLowerCase()}...`
                  }
                  disabled={isDisabled}
                />
                <NativeSelectContent>
                  {field.options.map((opt) => (
                    <NativeSelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </NativeSelectItem>
                  ))}
                </NativeSelectContent>
              </NativeSelect>
              {field.description ? (
                <NativeText preset="caption" className="text-muted-foreground">
                  {field.description}
                </NativeText>
              ) : null}
              {errorMessage ? (
                <NativeText preset="caption" className="text-destructive">
                  {errorMessage}
                </NativeText>
              ) : null}
            </View>
          );
        }

        // ------------------------------------------------------------------
        // Textarea
        // ------------------------------------------------------------------
        if (fieldType === "textarea") {
          return (
            <View className="gap-1.5">
              <NativeTextarea
                label={label}
                placeholder={field.placeholder}
                rows={field.rows ?? 3}
                value={f.value != null ? String(f.value) : ""}
                onChangeText={f.onChange}
                editable={!isDisabled}
              />
              {field.description ? (
                <NativeText preset="caption" className="text-muted-foreground">
                  {field.description}
                </NativeText>
              ) : null}
              {errorMessage ? (
                <NativeText preset="caption" className="text-destructive">
                  {errorMessage}
                </NativeText>
              ) : null}
            </View>
          );
        }

        // ------------------------------------------------------------------
        // Number
        // ------------------------------------------------------------------
        if (fieldType === "number") {
          return (
            <View className="gap-1.5">
              <NativeInput
                label={label}
                placeholder={field.placeholder}
                keyboardType="numeric"
                value={f.value != null ? String(f.value) : ""}
                onChangeText={(text) => {
                  if (text === "") {
                    f.onChange(undefined);
                  } else {
                    const num = Number(text);
                    f.onChange(Number.isNaN(num) ? text : num);
                  }
                }}
                editable={!isDisabled}
                autoFocus={autoFocus}
              />
              {field.description ? (
                <NativeText preset="caption" className="text-muted-foreground">
                  {field.description}
                </NativeText>
              ) : null}
              {errorMessage ? (
                <NativeText preset="caption" className="text-destructive">
                  {errorMessage}
                </NativeText>
              ) : null}
            </View>
          );
        }

        // ------------------------------------------------------------------
        // Text, email, tel, url, date (and any other text-like types). Autofill only when the
        // field asks for it (as on the web): on a form about someone else it would fill in the
        // person holding the phone.
        // ------------------------------------------------------------------
        return (
          <View className="gap-1.5">
            <NativeInput
              label={label}
              placeholder={field.placeholder}
              keyboardType={KEYBOARD_TYPE_MAP[fieldType] ?? "default"}
              autoCapitalize={AUTO_CAPITALIZE_MAP[fieldType] ?? "sentences"}
              {...(field.autoComplete
                ? { autoComplete: field.autoComplete as TextInputProps["autoComplete"] }
                : {})}
              {...(field.inputMode ? { inputMode: field.inputMode } : {})}
              {...(field.enterKeyHint ? { enterKeyHint: field.enterKeyHint } : {})}
              value={f.value != null ? String(f.value) : ""}
              onChangeText={f.onChange}
              editable={!isDisabled}
              autoFocus={autoFocus}
            />
            {field.description ? (
              <NativeText preset="caption" className="text-muted-foreground">
                {field.description}
              </NativeText>
            ) : null}
            {errorMessage ? (
              <NativeText preset="caption" className="text-destructive">
                {errorMessage}
              </NativeText>
            ) : null}
          </View>
        );
      }}
    />
  );
}

export { NativeResourceFormFieldRenderer };
