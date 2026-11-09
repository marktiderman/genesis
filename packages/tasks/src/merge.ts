// Two-way sync without losing an edit: a three-way merge of the shared fields against the last
// state both sides agreed on (the base), one field at a time. A field only one side changed takes
// that side's value; a field both changed to different values is a conflict, decided by which
// side changed last (or `prefer` when that isn't known). Editing the title in the app and ticking
// the task off in Todoist keeps both.
import { normalizeTaskFields, TASK_FIELDS, type TaskFields } from "./types";

/** What `mergeTask` takes. @stability Beta */
export interface MergeTaskInput {
  /** The fields as both sides last agreed (stored after each sync); null when the pair was never synced. */
  base: TaskFields | null;
  /** The app's task now. */
  local: TaskFields;
  /** The outside list's task now. */
  remote: TaskFields;
  /** When the app's task last changed (ISO 8601 or a Date), to decide a conflict. */
  localChangedAt?: string | Date | null | undefined;
  /** When the outside task last changed, to decide a conflict. */
  remoteChangedAt?: string | Date | null | undefined;
  /** Who wins a conflict when the times don't tell (missing or equal). Default `"local"`. */
  prefer?: "local" | "remote" | undefined;
}

/** What `mergeTask` decided. @stability Beta */
export interface MergeTaskResult {
  /** The fields both sides should hold now: store them as the next base once both are written. */
  fields: TaskFields;
  /** What to write to the app's task (only the fields that change there). */
  toLocal: Partial<TaskFields>;
  /** What to write to the outside task (only the fields that change there). */
  toRemote: Partial<TaskFields>;
  /** The fields both sides changed to different values, decided by time or `prefer`. */
  conflicts: (keyof TaskFields)[];
}

const time = (value: string | Date | null | undefined): number | null => {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Merges the app's task and the outside task against their base, field by field.
 *
 * ```ts
 * const { toLocal, toRemote, fields } = mergeTask({ base: link.base, local, remote, localChangedAt, remoteChangedAt });
 * if (Object.keys(toRemote).length) await runTodoistCommands({ accessToken, commands: [todoistCommand.update(id, toRemote)] });
 * if (Object.keys(toLocal).length) await saveTask(taskId, toLocal);
 * await saveBase(link.id, fields);
 * ```
 *
 * @stability Beta
 */
export function mergeTask(input: MergeTaskInput): MergeTaskResult {
  const local = normalizeTaskFields(input.local);
  const remote = normalizeTaskFields(input.remote);
  const base = input.base ? normalizeTaskFields(input.base) : null;
  const l = time(input.localChangedAt);
  const r = time(input.remoteChangedAt);
  const localWins = l !== null && r !== null && l !== r ? l > r : (input.prefer ?? "local") === "local";

  const fields = { ...local };
  const toLocal: Partial<TaskFields> = {};
  const toRemote: Partial<TaskFields> = {};
  const conflicts: (keyof TaskFields)[] = [];
  const set = <K extends keyof TaskFields>(key: K, value: TaskFields[K], side: "local" | "remote") => {
    fields[key] = value;
    if (side === "remote") (toRemote as Record<K, TaskFields[K]>)[key] = value;
    else (toLocal as Record<K, TaskFields[K]>)[key] = value;
  };

  for (const key of TASK_FIELDS) {
    const lv = local[key];
    const rv = remote[key];
    if (lv === rv) continue;
    const localChanged = base === null || base[key] !== lv;
    const remoteChanged = base === null || base[key] !== rv;
    if (localChanged && !remoteChanged) set(key, lv, "remote");
    else if (remoteChanged && !localChanged) set(key, rv, "local");
    else {
      conflicts.push(key);
      if (localWins) set(key, lv, "remote");
      else set(key, rv, "local");
    }
  }
  return { fields, toLocal, toRemote, conflicts };
}
