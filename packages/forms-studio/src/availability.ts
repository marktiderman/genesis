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
  /**
   * ISO times it takes responses from and until; open-ended when absent. Each needs `Z` or
   * an offset (`+02:00`): a time without one would be read on whatever clock the code runs
   * on. One that doesn't parse, or has no offset, keeps the form closed (fail closed).
   * Normalise times where they are written (`new Date(…).toISOString()`).
   */
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

// A date, a time, then Z or an hours-and-minutes offset.
const INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/** An ISO time with `Z` or an offset, as epoch milliseconds; NaN for anything else. */
export function parseInstant(value: string): number {
  const v = value.trim();
  return INSTANT.test(v) ? Date.parse(v.replace(" ", "T")) : Number.NaN;
}

/**
 * Where a form stands at `at`. Archived and draft first, then paused (staff chose it,
 * whatever the clock says), then the opening window (a time that can't be read, or has no
 * offset, counts as closed), then the cap. Only "live" takes
 * responses.
 */
export function formAvailability(form: AvailabilityInput, at: Date = new Date()): FormAvailability {
  if (form.status === "archived") return "archived";
  if (form.status === "draft" || form.published === false) return "draft";
  if (form.paused) return "paused";
  const t = at.getTime();
  if (form.opensAt) {
    const opens = parseInstant(form.opensAt);
    // A time that can't be read never opens the form.
    if (Number.isNaN(opens)) return "closed";
    if (t < opens) return "scheduled";
  }
  if (form.closesAt) {
    const closes = parseInstant(form.closesAt);
    if (Number.isNaN(closes) || t >= closes) return "closed";
  }
  if (isFull(form)) return "full";
  return "live";
}

/** Whether the form takes responses at `at`. */
export function takesResponses(form: AvailabilityInput, at: Date = new Date()): boolean {
  return formAvailability(form, at) === "live";
}
