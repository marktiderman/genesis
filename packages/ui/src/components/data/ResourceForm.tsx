"use client";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UseFormReturn, FieldErrors } from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../ui/sheet";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { cn } from "../../utils";
import { useIsMobile } from "../../hooks/use-mobile";
import {
  useResourceForm,
  type MutationMode,
  type UndoableWrite,
  type UseResourceFormOptions,
} from "@marktiderman/genesis-core/hooks";
import { showUndoToast, showWriteErrorToast } from "./undo-toast";
import { ConflictSheet } from "./ConflictSheet";
import { compact } from "./compact";
import { ResourceFormFieldRenderer, type ResourceFormFieldDef } from "./ResourceFormField";
import { WizardForm } from "./WizardForm";
import type { WizardStep } from "@marktiderman/genesis-core/hooks";
import { titleCase } from "../../hooks/use-resource-page";
import { fillMessage, useUiMessages } from "../../messages";
import { AlertTriangle } from "lucide-react";
import { isDataWriteError, type ResourceContract } from "@marktiderman/genesis-core";
import type { ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import { useViewFormFields, type ViewFormOptions } from "./resource-view/view-form";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ResourceFormProps {
  /** The resource it saves to. Default: the `view`'s. One of the two is required. */
  resource?: string | undefined;
  /**
   * A `defineView` description: the form `<ResourceView>` would open for it, with no list around
   * it (a form beside a sortable list, say). Its fields (only what a writer may send, links as
   * pickers, the viewer's scope filled hidden on create), its noun and its `copy.form` words. The
   * props below win: `fields` replaces the view's fields, and `title`, `submitLabel`,
   * `description` and `noun` replace its words.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract and row
  view?: View<ResourceContract<any>, any> | undefined;
  /** With `view`: the list's filter, as ResourceView's `filter` (a new row starts in it). */
  filter?: ViewFormOptions["filter"];
  /** With `view`: values a new row starts with, as ResourceView's `defaults`. */
  defaults?: ViewFormOptions["defaults"];
  /** With `view`: whether a new row takes the viewer's scope (default true), as ResourceView's `scoped`. */
  scoped?: boolean | undefined;
  action: "create" | "edit";
  item?: Record<string, unknown> | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The title, over everything else. */
  title?: string | undefined;
  /** The submit button's words ("Post", "Send"), over "Create" / "Save". */
  submitLabel?: string | undefined;
  /**
   * The form's description, read out with its title (`aria-describedby`), over the UI catalogue's
   * "Fill in the details to create a new {noun}." / "Update the {noun}.".
   */
  description?: string | undefined;
  /**
   * What one record is called ("goal"): the title reads "New goal" / "Edit goal" (the UI
   * catalogue's `form`). Without it the title is built from `resource`, as before.
   */
  noun?: string;
  fields?: ResourceFormFieldDef[] | undefined;
  /** Full dataset used to auto-detect select fields from unique values. */
  listData?: Record<string, unknown>[];
  renderForm?: ((
    form: UseFormReturn<Record<string, unknown>>,
    fields: ResourceFormFieldDef[],
  ) => ReactNode) | undefined;
  onSuccess?: (data: Record<string, unknown>) => void;
  onError?: ((error: Error) => void) | undefined;
  /** Layout mode for the form container. Default "dialog". */
  layout?: "dialog" | "sheet" | "page";
  /** Form presentation mode. Default "standard". */
  mode?: "standard" | "wizard" | undefined;
  /** Wizard step definitions. Required when mode is "wizard". */
  steps?: WizardStep[] | undefined;
  /** Number of columns for the form layout. Default 1. */
  columns?: 1 | 2 | undefined;
  /**
   * Pre-fill a create form from the page URL: a query param named like a
   * field (`?status=draft`) becomes that field's starting value. Default
   * `true`, as before. Pass `false` when the page's query string means
   * something else — a list's own filters, say — and must not leak into the
   * new record.
   */
  prefillFromUrl?: boolean;
  /**
   * Generate a placeholder ("Enter name") for fields whose `placeholder` is
   * unset. Default `false`: a placeholder that restates the label adds noise,
   * and reads as a filled value at a glance. A field's own `placeholder`
   * always shows. (Select fields keep their "Select…" prompt either way.)
   */
  autoPlaceholder?: boolean;
  /**
   * Warn before unsaved changes are lost. Default false. While the form is
   * dirty, Cancel / Esc / clicking outside asks first, and closing or
   * reloading the tab shows the browser's prompt. Pass `{ message }` to
   * change the question. For router navigation, see `onDirtyChange`.
   */
  warnWhenUnsaved?: boolean | { message?: string };
  /**
   * Called when the form becomes dirty or clean, with a `confirmLeave` that
   * asks when needed: the hook for a router blocker (SKILL.md "Unsaved
   * changes").
   */
  onDirtyChange?: (isDirty: boolean, confirmLeave: () => boolean) => void;
  /**
   * When a save reaches the list. Default `"pessimistic"`: the form waits
   * for the provider. `"optimistic"` closes at once and updates the cached
   * list, putting it back (and toasting the error) if the save fails.
   * `"undoable"` does the same and shows an Undo toast; the save is sent
   * after `undoDelayMs` unless undone (or at once, undone by the provider,
   * when it serves `undo`). Needs a mounted `<Toaster />`.
   */
  mutationMode?: MutationMode | undefined;
  /** How long an `undoable` save waits for an undo, in ms. Default 5000. */
  undoDelayMs?: number;
  /** Replaces the undo toast. */
  onUndoable?: (write: UndoableWrite) => void;
}

// ---------------------------------------------------------------------------
// Internal: shared form body
// ---------------------------------------------------------------------------

function FormBody({
  form,
  resolvedFields,
  renderForm,
  action,
  isSaving,
  isLoading,
  onOpenChange,
  handleSave,
  mode = "standard",
  steps,
  columns = 1,
  fill = false,
  submitLabel,
  seed = false,
}: {
  form: UseFormReturn<Record<string, unknown>>;
  resolvedFields: ResourceFormFieldDef[];
  renderForm?: ResourceFormProps["renderForm"] | undefined;
  action: "create" | "edit";
  isSaving: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  handleSave: (data: Record<string, unknown>) => Promise<void>;
  mode?: "standard" | "wizard" | undefined;
  steps?: WizardStep[] | undefined;
  columns?: 1 | 2 | undefined;
  /**
   * Fill the overlay it sits in: the fields scroll in the space left over and the Save and
   * Cancel buttons stay pinned to the bottom, clear of the phone's home indicator. Used by the
   * sheet layout; the dialog and page layouts keep the fields in a capped box instead.
   */
  fill?: boolean | undefined;
  submitLabel?: string | undefined;
  /** Reset to the defaults before the fields mount (a dialog or sheet form; see below). */
  seed?: boolean | undefined;
}) {
  // ResourceForm stays mounted while its dialog or sheet is closed, and with `shouldUnregister`
  // the form's values start empty, so react-hook-form can count it dirty against its defaults. A
  // field registering would then correct that while it renders, which React reports as "Cannot
  // update a component while rendering a different component". Resetting to the defaults before
  // the fields mount (nothing is registered yet, so nothing typed is lost) keeps registration
  // quiet; a layout effect runs before paint, so the spinner below is never seen.
  // Only in a dialog or sheet (`seed`), the forms that stay mounted while closed: a page form is
  // drawn with its fields at once, on the server too.
  const [seeded, setSeeded] = useState(!seed);
  useLayoutEffect(() => {
    if (!seed) return;
    form.reset(form.formState.defaultValues as Record<string, unknown>, { keepDefaultValues: true });
    setSeeded(true);
    // Once, as the body mounts; later defaults are useResourceForm's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only watch all values when conditional fields exist (performance optimization)
  const hasConditionalFields = resolvedFields.some((f: ResourceFormFieldDef) => f.visible || f.disabled);
  const watchedValues = useWatch({
    control: form.control,
    disabled: !hasConditionalFields,
  }) as Record<string, unknown>;

  // A failed save lands in `errors.root` (useResourceForm sets it from the
  // provider's error). Without this the Save button just stops spinning and
  // the user is left guessing; `role="alert"` makes it announce as well.
  const rootError = form.formState.errors.root?.message;
  const rootErrorBanner = rootError ? (
    <div
      role="alert"
      data-testid="resource-form-error"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{rootError}</span>
    </div>
  ) : null;

  const onInvalid = (errors: FieldErrors) => {
    const firstErrorKey = Object.keys(errors)[0];
    if (firstErrorKey) form.setFocus(firstErrorKey);
  };

  if (isLoading || !seeded) {
    return (
      <div className={cn("flex items-center justify-center py-8", fill && "flex-1")}>
        <Spinner />
      </div>
    );
  }

  // Wizard mode
  if (mode === "wizard" && steps) {
    return (
      // In a sheet the wizard scrolls as a whole: it lays out its own step buttons.
      <div
        className={
          fill
            ? "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "space-y-4"
        }
      >
      {rootErrorBanner}
      <WizardForm
        steps={steps}
        form={form}
        fields={resolvedFields}
        onSubmit={handleSave}
        isSaving={isSaving}
        action={action}
        onInvalid={onInvalid}
      />
      </div>
    );
  }

  // Filter fields by visibility
  const visibleFields = resolvedFields.filter(
    (field) => field.visible?.(watchedValues) !== false,
  );

  let autoFocusAssigned = false;

  // Group fields by their `group` property
  const groups: { name: string | null; fields: ResourceFormFieldDef[] }[] = [];
  const groupMap = new Map<string | null, ResourceFormFieldDef[]>();

  for (const field of visibleFields) {
    const groupKey = field.group ?? null;
    if (!groupMap.has(groupKey)) {
      const arr: ResourceFormFieldDef[] = [];
      groupMap.set(groupKey, arr);
      groups.push({ name: groupKey, fields: arr });
    }
    groupMap.get(groupKey)!.push(field);
  }

  /** Render a list of fields with optional 2-column grid */
  function renderFields(fields: ResourceFormFieldDef[]) {
    const useGrid = columns === 2;
    return (
      <div className={useGrid ? "grid grid-cols-2 gap-4" : "space-y-4"}>
        {fields.map((field) => {
          const isHidden = field.hidden || field.type === "hidden";
          const shouldAutoFocus = !isHidden && !autoFocusAssigned;
          if (shouldAutoFocus) autoFocusAssigned = true;
          // Auto-span 2 columns for textarea and array fields in 2-column mode
          const autoSpan =
            useGrid && (field.type === "textarea" || field.type === "array") ? 2 : undefined;
          const span = useGrid ? (field.colSpan ?? autoSpan ?? 1) : undefined;
          return (
            <div key={field.key} className={span === 2 ? "col-span-2" : ""}>
              <ResourceFormFieldRenderer
                field={field}
                control={form.control}
                action={action}
                autoFocus={shouldAutoFocus}
                watchedValues={watchedValues}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <form
      // Validation is the schema's job, and its messages are wired to the
      // inputs (aria-describedby). Native constraint checks (`type="email"`,
      // `maxLength`) would otherwise block submit with a browser bubble that
      // bypasses them.
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit(handleSave, onInvalid)(e);
      }}
      className={fill ? "flex min-h-0 flex-1 flex-col" : "space-y-4"}
    >
      <div
        className={
          fill
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4"
            : "max-h-[60vh] overflow-y-auto px-1 supports-[height:100dvh]:max-h-[60dvh]"
        }
      >
        {renderForm ? (
          renderForm(form, visibleFields)
        ) : (
          <div className="space-y-4">
            {groups.map((group, idx) => (
              <div key={group.name ?? "__default"}>
                {group.name && (
                  <div className="pt-2">
                    {idx > 0 && <div className="border-t mb-3" />}
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                      {group.name}
                    </h3>
                  </div>
                )}
                {renderFields(group.fields)}
              </div>
            ))}
          </div>
        )}
      </div>

      {fill && rootErrorBanner ? <div className="px-6">{rootErrorBanner}</div> : rootErrorBanner}

      <div
        className={
          fill
            ? "flex justify-end gap-2 border-t border-border bg-background px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            : "flex justify-end gap-2"
        }
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Spinner size="sm" className="mr-2" />}
          {submitLabel ?? (action === "create" ? "Create" : "Save")}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResourceForm(props: ResourceFormProps) {
  const { view, filter, defaults, scoped } = props;
  // The same fields ResourceView's own form gets. Always called (a hook): with no view, none.
  const viewFields = useViewFormFields(view, { filter, defaults, scoped });
  const resource = props.resource ?? view?.resource;
  if (!resource) throw new Error("ResourceForm needs a resource or a view");
  const words = view?.definition.copy?.form;
  const {
    action,
    item,
    open,
    onOpenChange,
  } = props;
  const titleProp = props.title ?? (action === "create" ? words?.createTitle : words?.editTitle);
  const submitLabel = props.submitLabel ?? (action === "create" ? words?.createSubmit : words?.editSubmit);
  const descriptionProp = props.description ?? (action === "create" ? words?.createDescription : words?.editDescription);
  const noun = props.noun ?? view?.noun;
  const fieldsProp = props.fields ?? (view ? viewFields : undefined);
  const {
    listData,
    renderForm,
    onSuccess,
    onError,
    layout: layoutProp = "dialog",
    mode = "standard",
    steps,
    columns = 1,
    prefillFromUrl,
    autoPlaceholder = false,
    warnWhenUnsaved = false,
    onDirtyChange,
    mutationMode = "pessimistic",
    undoDelayMs,
    onUndoable,
  } = props;
  // What had focus as the form opened (the host's New or Edit button), to hand focus back on
  // close. Read while rendering the open, before the first field takes focus: autoFocus runs
  // before Radix's onOpenAutoFocus, so that callback can't be the place to read it.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasOpen.current = !!open;

  const isMobile = useIsMobile();
  const effectiveLayout = isMobile ? "sheet" : layoutProp;

  const m = useUiMessages();
  // Words, each step over the one before: from the resource name, then the noun (the contract's
  // or the view's), then the caller's title.
  const resourceLabel = titleCase(resource.replace(/s$/, ""));
  const formTitle =
    (titleProp !== undefined ? fillMessage(titleProp, { noun: noun ?? resourceLabel.toLowerCase() }) : undefined) ??
    (noun
      ? fillMessage(action === "create" ? m.form.createTitle : m.form.editTitle, { noun })
      : action === "create"
        ? `Create ${resourceLabel}`
        : `Edit ${resourceLabel}`);
  const formDescription =
    descriptionProp ??
    (noun
      ? fillMessage(action === "create" ? m.form.createDescription : m.form.editDescription, { noun })
      : `${action === "create" ? "Fill in the details to create a new" : "Update the"} ${resourceLabel.toLowerCase()} record.`);

  // `compact`: some settings are `undefined` here, which useResourceForm reads as absent. The type
  // argument keeps the literal checked against the hook's options, so a misspelled key is an error.
  const hookOptions: UseResourceFormOptions = compact<{
    [K in keyof UseResourceFormOptions]: UseResourceFormOptions[K] | undefined;
  }>({
    resource,
    action,
    id: item ? String(item["id"] ?? "") : undefined,
    initialData: item ?? undefined,
    fields: fieldsProp,
    // A view's fields are the whole form, even when it leaves none: never one per column of `item`.
    inferFields: props.fields === undefined && view ? false : undefined,
    listData,
    onSuccess: (data) => {
      onOpenChange(false);
      onSuccess?.(data);
    },
    // The form is closed by the time an optimistic or undoable save fails,
    // so the error has to reach the user some other way.
    // A conflict opens ConflictSheet below instead, so it isn't toasted twice.
    // The conflict sheet shows a conflict only while this form is mounted; one that comes back
    // after the form closed (a route change during the undo delay) is toasted instead.
    onError: onError ?? (mutationMode === "pessimistic"
      ? undefined
      : (error) => {
          // ...and only a conflict that carries their row: one without it has nothing to show there.
          if (mounted.current && isDataWriteError(error) && error.outcome === "conflict" && error.current) return;
          showWriteErrorToast(error);
        }),
    prefillFromUrl,
    autoPlaceholder,
    warnWhenUnsaved,
    // A closed dialog is not touched by a save that fails later.
    visible: open,
    mutationMode,
    undoDelayMs,
    onUndoable: onUndoable ?? showUndoToast,
  });

  const { form, resolvedFields, handleSave, isSaving, isLoading, isDirty, confirmLeave, conflict, keepMine, takeTheirs, dismissConflict } =
    useResourceForm(hookOptions);
  // A save that met someone else's change: theirs beside yours (over the form, or after an
  // optimistic save closed it).
  const conflictSheet = (
    <ConflictSheet
      conflict={conflict}
      noun={noun ?? resourceLabel.toLowerCase()}
      label={(field) => resolvedFields.find((f) => f.key === field)?.label ?? titleCase(field)}
      onKeepMine={keepMine}
      onTakeTheirs={takeTheirs}
      onDismiss={dismissConflict}
      testID="resource-form-conflict"
    />
  );

  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  });
  useEffect(() => {
    onDirtyChangeRef.current?.(isDirty, confirmLeave);
  }, [isDirty, confirmLeave]);

  // Cancel, Esc and clicking outside ask first when changes would be lost.
  // A successful save closes through onSuccess above, unguarded.
  const requestOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !confirmLeave()) return;
      onOpenChange(next);
    },
    [confirmLeave, onOpenChange],
  );

  const bodyProps = {
    submitLabel,
    form,
    resolvedFields,
    renderForm,
    action,
    isSaving,
    isLoading,
    onOpenChange: requestOpenChange,
    handleSave,
    mode,
    steps,
    columns,
  };

  // Radix hands focus back to a DialogTrigger on close. This form opens from the host's own
  // button, not a trigger, so focus fell to <body> and a keyboard user started again from the top
  // of the page. Go back to what had focus when it opened, if it's still on the page.
  const focusProps = {
    onCloseAutoFocus: (event: Event) => {
      const back = opener.current;
      opener.current = null;
      if (!back?.isConnected) return;
      event.preventDefault();
      back.focus();
    },
  };

  // ── Dialog layout ──
  if (effectiveLayout === "dialog") {
    return (
      <>
      <Dialog open={open} onOpenChange={requestOpenChange}>
        <DialogContent className="sm:max-w-[560px]" {...focusProps}>
          <DialogHeader>
            <DialogTitle>{formTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              {formDescription}
            </DialogDescription>
          </DialogHeader>
          <FormBody {...bodyProps} seed />
        </DialogContent>
      </Dialog>
      {conflictSheet}
      </>
    );
  }

  // ── Sheet layout ──
  if (effectiveLayout === "sheet") {
    return (
      <>
      <Sheet open={open} onOpenChange={requestOpenChange}>
        {/* The sheet keeps its width (three quarters of a phone, 480px from sm up). It doesn't
            scroll itself: the fields do, so Save and Cancel stay pinned at the bottom above the
            home indicator, instead of scrolling away with a nested box. (iOS Safari's keyboard
            doesn't resize dvh, so with the keyboard up the footer can sit under it.) */}
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-[480px]" {...focusProps}>
          <SheetHeader className="border-b border-border px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4 pr-14">
            <SheetTitle>{formTitle}</SheetTitle>
            <SheetDescription className="sr-only">
              {formDescription}
            </SheetDescription>
          </SheetHeader>
          <FormBody {...bodyProps} fill seed />
        </SheetContent>
      </Sheet>
      {conflictSheet}
      </>
    );
  }

  // ── Page layout ──
  // Closed (an optimistic save handed off): only a conflict that came back later shows.
  if (!open) return conflictSheet;

  return (
    <>
    <Card className="mx-auto max-w-[560px]">
      <CardHeader>
        <CardTitle>{formTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <FormBody {...bodyProps} />
      </CardContent>
    </Card>
    {conflictSheet}
    </>
  );
}
