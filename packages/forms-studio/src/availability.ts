// Whether a form is taking responses, and if not why: the one rule every surface uses
// (the public page and its submit endpoint, a forms list, the form's header and
// settings). Generic form settings (status, opening and closing times, paused and a
// response cap). Pure. Moved up from Breakthrough's src/lib/forms/availability.ts; an app
// that stores forms should apply the same rule on save.

export type FormAvailability =
  "draft" | "archived" | "paused" | "scheduled" | "closed" | "full" | "live";

export interface AvailabilityInput {
  status: "draft" | "active" | "archived";
  /** False when the form has never been published (it has no version to serve). */
  published?: boolean;
  /** ISO times it takes responses from and until; open-ended when absent. */
  opensAt?: string | null | undefined;
  closesAt?: string | null | undefined;
  paused?: boolean | undefined;
  /** At most this many completed responses; null or absent for no cap. */
  responseCap?: number | null | undefined;
  /** Completed, non-deleted responses so far, when the caller knows the count. */
  completedResponses?: number | null | undefined;
  /** Whether the cap is reached, when only that is known (the public page never sees the count). */
  full?: boolean | undefined;
}

/** Whether the form has its response cap: from `full` when given, else from the cap and count. */
export function isFull(
  form: Pick<AvailabilityInput, "responseCap" | "completedResponses" | "full">,
): boolean {
  if (form.full !== undefined) return form.full;
  return (
    form.responseCap != null &&
    form.completedResponses != null &&
    form.completedResponses >= form.responseCap
  );
}

/**
 * Where a form stands at `at`. Archived and draft first, then paused (staff chose it,
 * whatever the clock says), then the opening window, then the cap. Only "live" takes
 * responses.
 */
export function formAvailability(form: AvailabilityInput, at: Date = new Date()): FormAvailability {
  if (form.status === "archived") return "archived";
  if (form.status === "draft" || form.published === false) return "draft";
  if (form.paused) return "paused";
  const t = at.getTime();
  if (form.opensAt && t < Date.parse(form.opensAt)) return "scheduled";
  if (form.closesAt && t >= Date.parse(form.closesAt)) return "closed";
  if (isFull(form)) return "full";
  return "live";
}

/** Whether the form takes responses at `at`. */
export function takesResponses(form: AvailabilityInput, at: Date = new Date()): boolean {
  return formAvailability(form, at) === "live";
}
