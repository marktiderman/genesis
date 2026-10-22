"use client";

import { useId } from "react";
import { Controller, type Control } from "react-hook-form";
import type { ResourceFormFieldDef } from "@marktiderman/genesis-core";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { FormField, FormLabel, FormError, FormDescription } from "../patterns/form-field";
import { titleCase } from "../../hooks/use-resource-page";
import { RelationField } from "./RelationField";
import { FileUploadField } from "./FileUploadField";
import { FieldArrayRenderer } from "./FieldArrayRenderer";

// ---------------------------------------------------------------------------
// Types — single source of truth is @marktiderman/genesis-core/form-types
// ---------------------------------------------------------------------------

export type { FieldType, SelectOption, ResourceFormFieldDef } from "@marktiderman/genesis-core";

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function ResourceFormFieldRenderer({
  field,
  control,
  action,
  autoFocus,
  watchedValues,
}: {
  field: ResourceFormFieldDef;
  control: Control<Record<string, unknown>>;
  action: "create" | "edit";
  autoFocus?: boolean;
  watchedValues?: Record<string, unknown>;
}) {
  const label = field.label ?? titleCase(field.key);
  // Ids come from `useId`, not from `field.key`: two forms on one page (a
  // create dialog over an edit sheet, or two resources) would otherwise mint
  // the same `title-error` id twice and point each input at the other's
  // message. `useId` is also stable across server and client renders.
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const errorId = `${baseId}-error`;
  const descId = `${baseId}-desc`;
  const labelId = `${baseId}-label`;
  const fieldType = field.type ?? "text";
  const isReadOnly = action === "edit" && field.readOnlyOnEdit;
  const isDisabled = isReadOnly || (watchedValues ? field.disabled?.(watchedValues) === true : false);

  // Array fields use useFieldArray — rendered outside of Controller
  if (fieldType === "array" && field.arrayFields) {
    return (
      <FieldArrayRenderer
        field={field}
        control={control}
        action={action}
        watchedValues={watchedValues}
      />
    );
  }

  if (field.hidden || fieldType === "hidden") {
    return (
      <Controller
        name={field.key}
        control={control}
        render={({ field: f }) => <input type="hidden" {...f} value={String(f.value ?? "")} />}
      />
    );
  }

  return (
    <Controller
      name={field.key}
      control={control}
      render={({ field: f, fieldState }) => {
        const errorMessage = fieldState.error?.message;
        // The description stays referenced while an error shows: the error
        // says what is wrong, the description often says what is right.
        const describedBy =
          [field.description ? descId : null, errorMessage ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined;
        const ariaProps = {
          id: inputId,
          "aria-invalid": !!errorMessage || undefined,
          "aria-describedby": describedBy,
          "aria-required": field.required || undefined,
        };

        // Switch
        if (fieldType === "switch") {
          return (
            <FormField className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel htmlFor={inputId} error={!!errorMessage}>{label}</FormLabel>
                {field.description && <FormDescription id={descId}>{field.description}</FormDescription>}
                <FormError id={errorId}>{errorMessage}</FormError>
              </div>
              <Switch
                checked={!!f.value}
                onCheckedChange={f.onChange}
                disabled={isDisabled}
                {...ariaProps}
              />
            </FormField>
          );
        }

        // Checkbox
        if (fieldType === "checkbox") {
          return (
            <FormField className="flex flex-row items-start space-x-3 space-y-0">
              <Checkbox
                checked={!!f.value}
                onCheckedChange={f.onChange}
                disabled={isDisabled}
                {...ariaProps}
              />
              <div className="space-y-1 leading-none">
                <FormLabel htmlFor={inputId} error={!!errorMessage}>{label}</FormLabel>
                {field.description && <FormDescription id={descId}>{field.description}</FormDescription>}
                <FormError id={errorId}>{errorMessage}</FormError>
              </div>
            </FormField>
          );
        }

        // Select
        if (fieldType === "select" && field.options) {
          return (
            <FormField>
              <FormLabel htmlFor={inputId} error={!!errorMessage} required={field.required}>
                {label}
              </FormLabel>
              <Select
                value={f.value != null ? String(f.value) : ""}
                onValueChange={f.onChange}
                disabled={isDisabled}
              >
                <SelectTrigger
                  {...ariaProps}
                >
                  <SelectValue placeholder={field.placeholder ?? `Select ${label.toLowerCase()}...`} />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.description && <FormDescription id={descId}>{field.description}</FormDescription>}
              <FormError id={errorId}>{errorMessage}</FormError>
            </FormField>
          );
        }

        // Relation
        if (fieldType === "relation" && field.relation) {
          return (
            <FormField>
              <FormLabel htmlFor={inputId} error={!!errorMessage} required={field.required}>
                {label}
              </FormLabel>
              <RelationField
                field={field}
                value={f.value != null ? String(f.value) : ""}
                onChange={f.onChange}
                disabled={isDisabled}
                {...ariaProps}
              />
              {field.description && <FormDescription id={descId}>{field.description}</FormDescription>}
              <FormError id={errorId}>{errorMessage}</FormError>
            </FormField>
          );
        }

        // File / Image
        if (fieldType === "file" || fieldType === "image") {
          return (
            <FormField>
              <FormLabel id={labelId} htmlFor={inputId} error={!!errorMessage} required={field.required}>
                {label}
              </FormLabel>
              <FileUploadField
                aria-labelledby={labelId}
                field={field}
                value={f.value as File | File[] | null}
                onChange={f.onChange}
                disabled={isDisabled}
                {...ariaProps}
              />
              {field.description && <FormDescription id={descId}>{field.description}</FormDescription>}
              <FormError id={errorId}>{errorMessage}</FormError>
            </FormField>
          );
        }

        // Textarea
        if (fieldType === "textarea") {
          return (
            <FormField>
              <FormLabel htmlFor={inputId} error={!!errorMessage} required={field.required}>
                {label}
              </FormLabel>
              <Textarea
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                rows={field.rows ?? 3}
                value={f.value != null ? String(f.value) : ""}
                onChange={(e) => f.onChange(e.target.value)}
                disabled={isDisabled}
                autoFocus={autoFocus}
                {...ariaProps}
              />
              {field.description && <FormDescription id={descId}>{field.description}</FormDescription>}
              <FormError id={errorId}>{errorMessage}</FormError>
            </FormField>
          );
        }

        // Number
        if (fieldType === "number") {
          return (
            <FormField>
              <FormLabel htmlFor={inputId} error={!!errorMessage} required={field.required}>
                {label}
              </FormLabel>
              <Input
                type="number"
                placeholder={field.placeholder}
                min={field.min}
                max={field.max}
                value={f.value != null ? String(f.value) : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  f.onChange(val === "" ? undefined : Number(val));
                }}
                disabled={isDisabled}
                autoFocus={autoFocus}
                {...ariaProps}
              />
              {field.description && <FormDescription id={descId}>{field.description}</FormDescription>}
              <FormError id={errorId}>{errorMessage}</FormError>
            </FormField>
          );
        }

        // Text, email, url, date
        return (
          <FormField>
            <FormLabel htmlFor={inputId} error={!!errorMessage} required={field.required}>
              {label}
            </FormLabel>
            <Input
              type={fieldType}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              value={f.value != null ? String(f.value) : ""}
              onChange={(e) => f.onChange(e.target.value)}
              disabled={isDisabled}
              autoFocus={autoFocus}
              {...ariaProps}
            />
            {field.description && <FormDescription id={descId}>{field.description}</FormDescription>}
            <FormError id={errorId}>{errorMessage}</FormError>
          </FormField>
        );
      }}
    />
  );
}
