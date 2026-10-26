import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useForm, type UseFormReturn, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOne } from "./use-one";
import { useDataProvider, useStorage } from "../provider/context";
import { useQueryClient } from "@tanstack/react-query";
import { titleCase } from "../utils";
import type { ResourceFormFieldDef, FieldType } from "../form-types";
import type { BaseRecord, InvalidationKey } from "../provider/types";
import { relatedKeys } from "./related-keys";
import { isDataWriteError } from "../schema/write-outcome";
import {
  cachedRecord,
  executeWrite,
  invalidateResource,
  sameValue,
  type MutationModeOptions,
} from "./mutation-mode";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";

/** A deep copy where the platform allows one (form values are plain data). */
function structuredCloneSafe<T>(value: T): T {
  try {
    return typeof structuredClone === "function" ? structuredClone(value) : value;
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseResourceFormOptions extends MutationModeOptions {
  resource: string;
  action: "create" | "edit";
  id?: string;
  initialData?: Record<string, unknown>;
  fields?: ResourceFormFieldDef[];
  /** Full dataset used to auto-detect select fields from unique values. */
  listData?: Record<string, unknown>[];
  /**
   * The form is done. After the save in `pessimistic` mode (with the stored
   * row); at once in `optimistic` and `undoable` modes (with the submitted
   * values over the record, and no `id` for a create).
   */
  onSuccess?: (data: Record<string, unknown>) => void;
  /**
   * The save failed. In `optimistic` and `undoable` modes the form may be
   * gone by then, so show the error from here (genesis-ui's ResourceForm
   * toasts it when no `onError` is given).
   */
  onError?: (error: Error) => void;
  /**
   * Warn before unsaved changes are lost. Default false. While the form is
   * dirty, closing or reloading the tab shows the browser's prompt, and
   * `confirmLeave()` asks before in-app navigation (wire it to a router
   * blocker; see SKILL.md "Unsaved changes").
   */
  warnWhenUnsaved?: boolean | { message?: string };
  /**
   * Whether the form is on screen. Default true. Pass false while it is
   * hidden but still mounted (a closed dialog). An optimistic or undoable
   * save that fails later is put back on the form (field errors, unsaved
   * again) only while the form is mounted, visible and still holds the
   * values it saved; otherwise the failure only reaches `onError`.
   */
  visible?: boolean;
  /**
   * Pre-fill create form defaults from URL query params: a param named like a
   * field (`?status=draft`) becomes that field's starting value. Default true.
   * Pass false for a form that should not read the page's URL, e.g. one
   * opened from a list whose own filters live in the query string.
   */
  prefillFromUrl?: boolean;
  /**
   * Generate a placeholder ("Enter name", "name@example.com") for a field
   * whose `placeholder` is unset. Default true. A placeholder that only
   * repeats the label adds noise without information, so `ResourceForm`
   * turns this off unless asked.
   */
  autoPlaceholder?: boolean;
  /** Validation trigger mode. Default "onBlur". */
  validationMode?: "onBlur" | "onChange" | "onSubmit";
  /** Enable autosave drafts to localStorage for create mode. */
  autosave?: boolean | { debounceMs?: number };
  /**
   * Other query keys to invalidate after a save, on top of `[resource]` and
   * the provider's own `invalidates`.
   */
  invalidates?: InvalidationKey[];
  /**
   * What an edit sends. `"loaded"` (default): every field of the record the form opened with,
   * plus any field the person changed, but never a field the record didn't carry and nobody
   * touched. So a list that didn't load a column (or a value the server left out) can't be
   * overwritten with an empty one. `"all"`: every form field, as before.
   */
  updates?: "loaded" | "all";
}

export interface UseResourceFormReturn {
  form: UseFormReturn<Record<string, unknown>>;
  resolvedFields: ResourceFormFieldDef[];
  onSubmit: (e?: { preventDefault?: () => void }) => Promise<void>;
  /** Raw save handler — use with form.handleSubmit(handleSave, onInvalid). */
  handleSave: (data: Record<string, unknown>) => Promise<void>;
  isSaving: boolean;
  isLoading: boolean;
  /**
   * The form has changes that have not been saved. False again once a save
   * succeeds (or, in optimistic / undoable modes, is handed off).
   */
  isDirty: boolean;
  /**
   * For in-app navigation: true when it is fine to leave (nothing unsaved,
   * `warnWhenUnsaved` off, or the user confirmed). Asks with
   * `window.confirm` otherwise.
   */
  confirmLeave: () => boolean;
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
  autoPlaceholder = true,
): ResourceFormFieldDef[] {
  const placeholderFor = (key: string, type: FieldType): string | undefined =>
    autoPlaceholder ? defaultPlaceholder(key, type) : undefined;
  if (fields && fields.length > 0) {
    return fields.map((f) => {
      const inferred = f.type ?? (data ? inferFieldType(data[f.key]) : "text");
      return {
        ...f,
        label: f.label ?? titleCase(f.key),
        type: inferred,
        placeholder: f.placeholder ?? placeholderFor(f.key, inferred),
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
            placeholder: autoPlaceholder
              ? `Select ${titleCase(key).toLowerCase()}...`
              : undefined,
            required: true,
          };
        }
      }

      const inferred = inferFieldType(data[key]);
      return {
        key,
        label: titleCase(key),
        type: inferred,
        placeholder: placeholderFor(key, inferred),
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
              if (sub.maxLength != null) {
                s = s.max(
                  sub.maxLength,
                  `${sub.label ?? titleCase(sub.key)} must be ${sub.maxLength} characters or fewer`,
                );
              }
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
        if (field.maxLength != null) {
          schema = schema.max(
            field.maxLength,
            `${field.label ?? titleCase(field.key)} must be ${field.maxLength} characters or fewer`,
          );
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
    // A create's blank template (every column as "") never hides a field's own default.
    const blankOnCreate = action === "create" && data?.[field.key] === "" && field.defaultValue !== undefined;
    if (data && field.key in data && !blankOnCreate) {
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
    autoPlaceholder = true,
    validationMode,
    autosave,
    invalidates,
    warnWhenUnsaved = false,
    mutationMode = "pessimistic",
    undoDelayMs,
    onUndoable,
    visible = true,
    updates = "loaded",
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

  // In edit mode the form starts from the provider's form shape of the row
  // (`DataProvider.toFormValues`), for a resource whose form differs from
  // its table. The record id still comes from the row itself.
  const formSource = useMemo(
    () =>
      action === "edit" && effectiveData && provider.toFormValues
        ? provider.toFormValues(resource, effectiveData)
        : effectiveData,
    [action, effectiveData, provider, resource],
  );

  // Resolve fields
  const resolvedFields = useMemo(
    () => resolveFields(fieldsProp, formSource, listData, autoPlaceholder),
    [fieldsProp, formSource, listData, autoPlaceholder],
  );

  // Build schema
  const schema = useMemo(
    () => buildSchema(resolvedFields),
    [resolvedFields],
  );

  // Build defaults (with optional draft restoration)
  const defaultValues = useMemo(() => {
    const defaults = buildDefaults(resolvedFields, formSource, action, prefillFromUrl);
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
  }, [resolvedFields, formSource, action, prefillFromUrl, autosaveEnabled, resource, storage]);

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

  // Unsaved changes: RHF's isDirty, cleared by a successful save until the
  // next edit (a create form keeps its values after saving, so RHF alone
  // would still call it dirty).
  const rhfDirty = form.formState.isDirty;
  const [savedClean, setSavedClean] = useState(false);
  const savedCleanRef = useRef(false);
  useEffect(() => {
    const subscription = form.watch((_values, info) => {
      // `watch` also reports resets (no field name); only an edit dirties.
      if (!info.name) return;
      savedCleanRef.current = false;
      setSavedClean(false);
    });
    return () => subscription.unsubscribe();
  }, [form]);
  const isDirty = rhfDirty && !savedClean;
  const warn = !!warnWhenUnsaved;
  const { confirmLeave: guardConfirm } = useUnsavedChangesGuard({
    when: warn && isDirty,
    message: typeof warnWhenUnsaved === "object" ? warnWhenUnsaved.message : undefined,
  });
  const confirmLeave = useCallback(
    // The ref, not state: a router blocker may ask in the same tick as the
    // save's onSuccess navigates, before a re-render.
    () => (!warn || savedCleanRef.current ? true : guardConfirm()),
    [warn, guardConfirm],
  );
  const markSaved = useCallback(() => {
    savedCleanRef.current = true;
    setSavedClean(true);
  }, []);

  // A save that fails after it was handed off only comes back to the form
  // while the user can still see it.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  /** A failed save, on the form: per-field messages and a root summary. */
  const showError = useCallback(
    (error: Error) => {
      const fieldErrors = isDataWriteError(error) ? error.fields : undefined;
      const known = new Set(resolvedFields.map((f) => f.key));
      let first: string | undefined;
      if (fieldErrors) {
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (!known.has(field)) continue;
          form.setError(field, { type: "server", message });
          first ??= field;
        }
      }
      form.setError("root", { type: "server", message: error.message });
      if (first) {
        try {
          form.setFocus(first);
        } catch {
          // Not rendered (hidden or custom renderForm): the summary still says it.
        }
      }
    },
    [form, resolvedFields],
  );

  const reportError = useCallback(
    (error: Error, handedOff?: Record<string, unknown>) => {
      // A save handed off optimistically and then refused is unsaved again,
      // if the form still shows what it saved; a closed, hidden or reset
      // form is left alone.
      const onForm =
        !handedOff ||
        (mountedRef.current && visibleRef.current && sameValue(form.getValues(), handedOff));
      if (onForm) {
        savedCleanRef.current = false;
        setSavedClean(false);
        showError(error);
      }
      if (onError) {
        onError(error);
      } else {
        console.error(`[useResourceForm] ${action} failed for "${resource}":`, error);
      }
    },
    [form, showError, onError, action, resource],
  );

  // Submit handler
  const handleSubmit = useCallback(
    async (submitted: Record<string, unknown>) => {
      // What the form shows as this save goes out (raw input values, before
      // any resolver coercion), to tell later whether it still does.
      const shown = structuredCloneSafe(form.getValues());
      // A field the opened record didn't carry goes only when the person changed it (compared by
      // value: RHF's dirtyFields updates only when read during render).
      const opened = formSource as Record<string, unknown> | undefined;
      const formData =
        action === "edit" && updates === "loaded" && opened
          ? Object.fromEntries(
              Object.entries(submitted).filter(
                // Changed: what an input shows differs from where it started, or, for a value saved
                // without an input (a direct handleSave), the value itself does.
                ([k, v]) =>
                  k in opened ||
                  !sameValue(k in (shown as object) ? (shown as Record<string, unknown>)[k] : v, defaultValues[k]),
              ),
            )
          : submitted;
      try {
        let recordId: string | number | undefined;
        if (action === "edit") {
          recordId = id ?? String((effectiveData as Record<string, unknown>)?.id ?? "");
          if (!recordId) {
            throw new Error("Cannot update record: no ID available. Provide an id prop or ensure the record has an id field.");
          }
        }
        const before = recordId != null ? cachedRecord(queryClient, resource, recordId) : undefined;
        const outcome = await executeWrite<BaseRecord>({
          queryClient,
          provider,
          resource,
          kind: action === "create" ? "create" : "update",
          id: recordId,
          // The cache holds rows; patch it only when the form's values are
          // row-shaped (no provider.toFormValues reshaping this record).
          data: formSource === effectiveData ? formData : undefined,
          mode: mutationMode,
          undoDelayMs,
          onUndoable,
          send: async (ctx) => {
            const keepalive = ctx.keepalive ? { keepalive: true } : {};
            const res =
              action === "create"
                ? await provider.create(resource, { data: formData, ...keepalive })
                : await provider.update(resource, { id: recordId!, data: ctx.data ?? formData, ...keepalive });
            return { record: res.data, audit: res.audit };
          },
          committed: async (result) => {
            // Clear draft on successful save
            if (autosaveEnabled && action === "create") {
              try {
                storage.removeItem(`genesis-draft:${resource}:new`);
              } catch (err) {
                console.warn(`[useResourceForm] Draft cleanup failed for "${resource}":`, err instanceof Error ? err.message : String(err));
              }
            }
            // Invalidate queries to refresh data: the resource's own, then any
            // related keys the provider or the caller named.
            await invalidateResource(queryClient, resource);
            const related = relatedKeys(
              provider,
              {
                resource,
                kind: action === "create" ? "create" : "update",
                id: (recordId ?? result.id) as string | number,
                record: result,
              },
              invalidates,
            );
            await Promise.all(related.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })));
          },
          failedLater: (error) => reportError(error, shown),
        });
        markSaved();
        if (outcome.status === "committed") {
          onSuccess?.(outcome.record);
        } else {
          onSuccess?.(
            action === "edit"
              ? { ...(before ?? effectiveData ?? {}), ...formData, id: recordId }
              : { ...formData },
          );
        }
      } catch (err) {
        reportError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [form, action, provider, resource, id, effectiveData, formSource, queryClient, onSuccess, autosaveEnabled, storage, invalidates, mutationMode, undoDelayMs, onUndoable, reportError, markSaved, updates, defaultValues],
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
    isDirty,
    confirmLeave,
  };
}
