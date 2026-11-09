// A task as an outside list (Todoist; later Google Tasks or Microsoft To Do) keeps it, and the
// fields an app's own task shares with it. Provider adapters turn their objects into these.
import type { Day } from "@marktiderman/genesis-core/dates";

/**
 * The fields a two-way sync keeps equal on both sides. Anything else on the outside task
 * (priority, labels, a due time, a recurrence) stays the outside list's and is never written
 * from the app's side. @stability Beta
 */
export interface TaskFields {
  /** The task's text, trimmed. Never empty. */
  title: string;
  /** The longer description, trimmed; empty for none. */
  notes: string;
  /** The day it is due, on the owner's calendar; null for none. */
  dueDay: Day | null;
  /** Whether it is done (completed, checked). */
  done: boolean;
}

/**
 * Fields a sync can keep equal too, when the app opts in (`mergeTask`'s `fields`): labels (names,
 * compared without case) and priority (1 normal to 4 most urgent, Todoist's API scale).
 * @stability Beta
 */
export interface ExtraTaskFields {
  labels: string[];
  priority: 1 | 2 | 3 | 4;
}

/** The shared fields plus any extra ones a sync opted into. @stability Beta */
export type SyncedTaskFields = TaskFields & Partial<ExtraTaskFields>;

/** Every field `mergeTask` can merge. @stability Beta */
export type SyncedFieldName = keyof TaskFields | keyof ExtraTaskFields;

/** Labels as a sync compares them: trimmed, without empties, one of each regardless of case (the first spelling kept). @stability Beta */
export function normalizeLabels(labels: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels ?? []) {
    const label = String(raw).trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** The keys of `TaskFields`, in a fixed order. @stability Beta */
export const TASK_FIELDS = ["title", "notes", "dueDay", "done"] as const satisfies readonly (keyof TaskFields)[];

/** A task as the outside list has it. @stability Beta */
export interface ExternalTask extends TaskFields {
  /** The provider's id for the task. */
  externalId: string;
  /** The list (Todoist project) it is in. */
  listId: string | null;
  /** The section within the list, when the provider has them. */
  sectionId: string | null;
  /** The task it is a sub-task of. */
  parentId: string | null;
  /** Deleted at the provider: a sync removes or bins its copy. */
  deleted: boolean;
  /** A repeating task: done moves its due day on rather than finishing it. */
  recurring: boolean;
  /** The time of day it is due (`HH:MM`, on its zone's clock), when it has one. */
  dueTime: string | null;
  /** The zone a timed due date is fixed to; null for a floating one (the owner's clock). */
  dueTimeZone: string | null;
  /** The provider's own wording of the due date ("every monday"), when it has one. */
  dueText: string | null;
  /** 1 (normal) to 4 (most urgent), Todoist's API scale. */
  priority: 1 | 2 | 3 | 4;
  labels: string[];
  /** Who the task is assigned to in a shared project (the provider's user id), or null. */
  assigneeId: string | null;
  /** When it was completed (ISO 8601), when it is done. */
  completedAt: string | null;
  /** When it last changed at the provider (ISO 8601), when the provider says. */
  updatedAt: string | null;
  /** A link that opens the task in the provider's app. */
  url: string | null;
}

/** A list (a Todoist project) a task can be in. @stability Beta */
export interface ExternalList {
  externalId: string;
  name: string;
  /** Deleted or archived at the provider. */
  gone: boolean;
  /** The provider's inbox: where a task with no list goes. */
  inbox: boolean;
}

/** Normalizes the shared fields, so equal tasks compare equal. @stability Beta */
export function normalizeTaskFields(fields: TaskFields): TaskFields {
  return {
    title: fields.title.trim(),
    notes: (fields.notes ?? "").trim(),
    dueDay: fields.dueDay || null,
    done: fields.done === true,
  };
}
