import { useMemo, useCallback, useEffect } from "react";
import { useForm, type UseFormReturn, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOne } from "./use-one";
import { useDataProvider, useStorage } from "../provider/context";
import { useQueryClient } from "@tanstack/react-query";
import { titleCase } from "../utils";
import type { ResourceFormFieldDef, FieldType } from "../form-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseResourceFormOptions {
  resource: string;
  action: "create" | "edit";
  id?: string;
  initialData?: Record<string, unknown>;
  fields?: ResourceFormFieldDef[];
  /** Full dataset used to auto-detect select fields from unique values. */
  listData?: Record<string, unknown>[];
  onSuccess?: (data: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
  /** Pre-fill create form defaults from URL query params. Default true. */
  prefillFromUrl?: boolean;
  /** Validation trigger mode. Default "onBlur". */
  validationMode?: "onBlur" | "onChange" | "onSubmit";
  /** Enable autosave drafts to localStorage for create mode. */
  autosave?: boolean | { debounceMs?: number };
}

export interface UseResourceFormReturn {
  form: UseFormReturn<Record<string, unknown>>;
  resolvedFields: ResourceFormFieldDef[];
  onSubmit: (e?: { preventDefault?: () => void }) => Promise<void>;
  /** Raw save handler — use with form.handleSubmit(handleSave, onInvalid). */
  handleSave: (data: Record<string, unknown>) => Promise<void>;
  isSaving: boolean;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Infer a field type from a value */
function inferFieldType(value: unknown): FieldType {
  if (typeof value === "boolean") return "switch";
  if (typeof value === "number") return "number";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
    if (value.includes("@") && value.includes(".")) return "email";
    if (/^https?:\/\//.test(value)) return "url";
    if (value.length > 100) return "textarea";
  }
  return "text";
}

/** Try to infer a select field from unique values across the full dataset */
function inferSelectFromData(
  key: string,
  allData: Record<string, unknown>[] | undefined,
): { type: "select"; options: { value: string; label: string }[] } | null {
  if (!allData || allData.length === 0) return null;
  const uniqueValues = new Set<string>();
  for (const row of allData) {
    const v = row[key];
    if (typeof v === "string" && v.length > 0) uniqueValues.add(v);
  }
  if (uniqueValues.size > 0 && uniqueValues.size <= 10) {
    return {
      type: "select" as const,
      options: Array.from(uniqueValues)
        .sort()
        .map((v) => ({ value: v, label: v })),
    };
  }
  return null;
}

/** Generate a sensible placeholder for an auto-inferred field */
function defaultPlaceholder(key: string, type: FieldType): string {
  switch (type) {
    case "email": return "name@example.com";
    case "url": return "https://...";
    case "number": return "0";
    case "date": return "YYYY-MM-DD";
    case "textarea": return `Enter ${titleCase(key).toLowerCase()}...`;
    default: return `Enter ${titleCase(key).toLowerCase()}`;
  }
}

/** Resolve fields from data keys when none provided */
function resolveFields(
  fields: ResourceFormFieldDef[] | undefined,
  data: Record<string, unknown> | undefined,
  allData?: Record<string, unknown>[],
): ResourceFormFieldDef[] {
  if (fields && fields.length > 0) {
    return fields.map((f) => {
      const inferred = f.type ?? (data ? inferFieldType(data[f.key]) : "text");
      return {
        ...f,
        label: f.label ?? titleCase(f.key),
        type: inferred,
        placeholder: f.placeholder ?? defaultPlaceholder(f.key, inferred),
        required: f.required ?? (inferred !== "switch" && inferred !== "checkbox" && inferred !== "hidden"),
      };
    });
  }

  if (!data) return [];

  return Object.keys(data)
    .filter((key) => key !== "id" && key !== "created_at" && key !== "updated_at")
    .map((key) => {
      // Check for select-like field first (string with few unique values)
      if (typeof data[key] === "string") {
        const selectInfo = inferSelectFromData(key, allData);
        if (selectInfo) {
          return {
            key,
            label: titleCase(key),
            type: selectInfo.type,
            options: selectInfo.options,
            placeholder: `Select ${titleCase(key).toLowerCase()}...`,
            required: true,
          };
        }
      }

      const inferred = inferFieldType(data[key]);
      return {
        key,
        label: titleCase(key),
        type: inferred,
        placeholder: defaultPlaceholder(key, inferred),
        required: inferred !== "switch" && inferred !== "checkbox" && inferred !== "hidden",
      };
    });
}

/** Build a zod schema from resolved fields */
function buildSchema(fields: ResourceFormFieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    const fieldType = field.type ?? "text";

    if (field.hidden || fieldType === "hidden") continue;

    // File/image fields store File objects — z.any() is intentional here because
    // the File API shape varies by platform (browser File, React Native asset, etc.)
    // and form libraries may wrap files differently.
    if (fieldType === "file" || fieldType === "image") {
      shape[field.key] = field.required !== false ? z.unknown().refine((v) => v != null, { message: `${field.label ?? titleCase(field.key)} is required` }) : z.unknown().optional();
      continue;
    }

    switch (fieldType) {
      case "number": {
        let schema = z.coerce.number({ message: "Must be a number" });
        if (field.min != null) schema = schema.min(field.min);
        if (field.max != null) schema = schema.max(field.max);
        shape[field.key] = field.required !== false
          ? schema
          : schema.optional();
        break;
      }
      case "array": {
        if (field.arrayFields) {
          const itemShape: Record<string, z.ZodTypeAny> = {};
          for (const sub of field.arrayFields) {
            const subType = sub.type ?? "text";
            if (subType === "number") {
              let s = z.coerce.number({ message: "Must be a number" });
              if (sub.min != null) s = s.min(sub.min);
              if (sub.max != null) s = s.max(sub.max);
              itemShape[sub.key] = sub.required !== false ? s : s.optional();
            } else if (subType === "switch" || subType === "checkbox") {
              itemShape[sub.key] = z.boolean().optional();
            } else {
              let s = z.string();
              if (sub.required !== false) {
                s = s.min(1, `${sub.label ?? titleCase(sub.key)} is required`);
              }
              if (subType === "email") s = s.email("Invalid email address");
              if (subType === "url") s = s.url("Invalid URL");
              itemShape[sub.key] = sub.required === false ? s.optional().or(z.literal("")) : s;
            }
          }
          let arraySchema: z.ZodTypeAny = z.array(z.object(itemShape));
          if (field.arrayMin != null) arraySchema = (arraySchema as z.ZodArray<z.ZodTypeAny>).min(field.arrayMin, `Minimum ${field.arrayMin} items required`);
          if (field.arrayMax != null) arraySchema = (arraySchema as z.ZodArray<z.ZodTypeAny>).max(field.arrayMax, `Maximum ${field.arrayMax} items allowed`);
          shape[field.key] = arraySchema;
        }
        break;
      }
      case "switch":
      case "checkbox": {
        shape[field.key] = z.boolean().optional();
        break;
      }
      default: {
        // text, email, url, textarea, date, select
        let schema = z.string();
        if (field.required !== false) {
          schema = schema.min(1, `${field.label ?? titleCase(field.key)} is required`);
        }
        if (fieldType === "email") {
          schema = schema.email("Invalid email address");
        }
        if (fieldType === "url") {
          schema = schema.url("Invalid URL");
        }
        shape[field.key] = field.required === false
          ? schema.optional().or(z.literal(""))
          : schema;
        break;
      }
    }
  }

  return z.object(shape).passthrough();
}

/** Build default values for a single array item from its sub-field definitions */
export function buildArrayItemDefaults(
  arrayFields: ResourceFormFieldDef[],
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const sub of arrayFields) {
    const subType = sub.type ?? "text";
    if (subType === "number") defaults[sub.key] = undefined;
    else if (subType === "switch" || subType === "checkbox") defaults[sub.key] = false;
    else defaults[sub.key] = sub.defaultValue ?? "";
  }
  return defaults;
}

/** Build default values from fields and existing data */
function buildDefaults(
  fields: ResourceFormFieldDef[],
  data: Record<string, unknown> | undefined,
  action: "create" | "edit",
  prefillFromUrl: boolean,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (data && field.key in data) {
      defaults[field.key] = data[field.key];
    } else if (field.defaultValue !== undefined) {
      defaults[field.key] = field.defaultValue;
    } else {
      const fieldType = field.type ?? "text";
      switch (fieldType) {
        case "array":
          defaults[field.key] = field.arrayMin
            ? Array.from({ length: field.arrayMin }, () =>
                buildArrayItemDefaults(field.arrayFields ?? []),
              )
            : [];
          break;
        case "number":
          defaults[field.key] = undefined;
          break;
        case "switch":
        case "checkbox":
          defaults[field.key] = false;
          break;
        default:
          defaults[field.key] = "";
          break;
      }
    }
  }

  // URL pre-fill for create mode
  if (typeof window !== "undefined" && typeof window.location !== "undefined" && typeof window.location.search === "string" && action === "create" && prefillFromUrl !== false) {
    const params = new URLSearchParams(window.location.search);
    for (const field of fields) {
      const val = params.get(field.key);
      if (val != null) {
        defaults[field.key] = field.type === "number" ? Number(val) : val;
      }
    }
  }

  return defaults;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useResourceForm(options: UseResourceFormOptions): UseResourceFormReturn {
  const {
    resource,
    action,
    id,
    initialData,
    fields: fieldsProp,
    listData,
    onSuccess,
    onError,
    prefillFromUrl = true,
    validationMode,
    autosave,
  } = options;

  const autosaveEnabled = !!autosave;
  const debounceMs = typeof autosave === "object" ? autosave.debounceMs ?? 1000 : 1000;

  const provider = useDataProvider();
  const storage = useStorage();
  const queryClient = useQueryClient();

  // Fetch record for edit mode when no initialData
  const needsFetch = action === "edit" && !initialData && !!id;
  const fetchResult = useOne(
    resource,
    needsFetch ? id : undefined,
    { enabled: needsFetch },
  );

  const fetchedData = fetchResult.data ?? undefined;
  const effectiveData = initialData ?? fetchedData;
  const isLoading = needsFetch && fetchResult.isLoading;

  // Resolve fields
  const resolvedFields = useMemo(
    () => resolveFields(fieldsProp, effectiveData, listData),
    [fieldsProp, effectiveData, listData],
  );

  // Build schema
  const schema = useMemo(
    () => buildSchema(resolvedFields),
    [resolvedFields],
  );

  // Build defaults (with optional draft restoration)
  const defaultValues = useMemo(() => {
    const defaults = buildDefaults(resolvedFields, effectiveData, action, prefillFromUrl);
    if (autosaveEnabled && action === "create") {
      const key = `genesis-draft:${resource}:new`;
      const saved = storage.getItem(key);
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          if (draft && typeof draft === "object" && !Array.isArray(draft)) {
            // Only restore keys that exist in the field definitions
            const validKeys = new Set(resolvedFields.map((f) => f.key));
            for (const k of Object.keys(draft)) {
              if (validKeys.has(k)) {
                defaults[k] = draft[k];
              }
            }
          } else {
            console.warn(`[useResourceForm] Draft for "${resource}" has unexpected shape, removing`);
            storage.removeItem(key);
          }
        } catch {
          console.warn(`[useResourceForm] Corrupt draft for "${resource}", removing`);
          storage.removeItem(key);
        }
      }
    }
    return defaults;
  }, [resolvedFields, effectiveData, action, prefillFromUrl, autosaveEnabled, resource, storage]);

  // Form
  // Cast the resolver because zod v4's passthrough() produces `unknown` for input,
  // but react-hook-form expects FieldValues (Record<string, any>).
  const resolver = useMemo(
    () => zodResolver(schema) as unknown as Resolver<Record<string, unknown>>,
    [schema],
  );

  const form = useForm<Record<string, unknown>>({
    resolver,
    defaultValues,
    values: action === "edit" ? defaultValues : undefined,
    mode: validationMode ?? "onBlur",
    reValidateMode: "onChange",
    shouldUnregister: true,
  });

  // Autosave effect — persist form values to storage for create mode
  useEffect(() => {
    if (!autosaveEnabled || action !== "create") return;
    const key = `genesis-draft:${resource}:new`;
    let timer: ReturnType<typeof setTimeout>;

    const subscription = form.watch((values) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          storage.setItem(key, JSON.stringify(values));
        } catch (err) {
          console.warn(`[useResourceForm] Autosave failed for "${resource}":`, err instanceof Error ? err.message : String(err));
        }
      }, debounceMs);
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [autosaveEnabled, resource, action, form, debounceMs, storage]);

  // Submit handler
  const handleSubmit = useCallback(
    async (formData: Record<string, unknown>) => {
      try {
        let result: Record<string, unknown>;
        if (action === "create") {
          const res = await provider.create(resource, { data: formData });
          result = res.data;
        } else {
          const recordId = id ?? String((effectiveData as Record<string, unknown>)?.id ?? "");
          if (!recordId) {
            throw new Error("Cannot update record: no ID available. Provide an id prop or ensure the record has an id field.");
          }
          const res = await provider.update(resource, { id: recordId, data: formData });
          result = res.data;
        }
        // Clear draft on successful save
        if (autosaveEnabled && action === "create") {
          try {
            storage.removeItem(`genesis-draft:${resource}:new`);
          } catch (err) {
            console.warn(`[useResourceForm] Draft cleanup failed for "${resource}":`, err instanceof Error ? err.message : String(err));
          }
        }
        // Invalidate queries to refresh data
        await queryClient.invalidateQueries({ queryKey: [resource] });
        onSuccess?.(result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        form.setError("root", { message: error.message });
        if (onError) {
          onError(error);
        } else {
          console.error(`[useResourceForm] ${action} failed for "${resource}":`, error);
        }
      }
    },
    // form is stable (from useForm) but included for correctness since we call form.setError
    [action, provider, resource, id, effectiveData, queryClient, onSuccess, onError, autosaveEnabled, form, storage],
  );

  const onSubmit = useCallback(
    (e?: { preventDefault?: () => void }) => form.handleSubmit(handleSubmit)(e as React.BaseSyntheticEvent),
    [form, handleSubmit],
  );

  const isSaving = form.formState.isSubmitting;

  return {
    form,
    resolvedFields,
    onSubmit,
    handleSave: handleSubmit,
    isSaving,
    isLoading,
  };
}
