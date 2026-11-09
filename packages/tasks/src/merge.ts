// Two-way sync without losing an edit: a three-way merge of the shared fields against the last
// state both sides agreed on (the base), one field at a time. A field only one side changed takes
// that side's value; a field both changed to different values is a conflict, decided by which
// side changed last (or `prefer` when that isn't known). Editing the title in the app and ticking
// the task off in Todoist keeps both.
import { normalizeLabels, normalizeTaskFields, TASK_FIELDS, type SyncedFieldName, type SyncedTaskFields, type TaskFields } from "./types";

/** What `mergeTask` takes. @stability Beta */
export interface MergeTaskInput {
  /** The fields as both sides last agreed (stored after each sync); null when the pair was never synced. */
  base: SyncedTaskFields | null;
  /** The app's task now. */
  local: SyncedTaskFields;
  /** The outside list's task now. */
  remote: SyncedTaskFields;
  /**
   * The fields to merge. Default the four shared ones (`TASK_FIELDS`); add `"labels"` and
   * `"priority"` to keep those equal too. Labels merge as a set: a label added on either side is
   * kept, and one removed on either side goes, so a label added here and another added there both
   * stay.
   */
  fields?: readonly SyncedFieldName[] | undefined;
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
  fields: SyncedTaskFields;
  /** What to write to the app's task (only the fields that change there). */
  toLocal: Partial<SyncedTaskFields>;
  /** What to write to the outside task (only the fields that change there). */
  toRemote: Partial<SyncedTaskFields>;
  /** The fields both sides changed to different values, decided by time or `prefer`. */
  conflicts: SyncedFieldName[];
}

const sameSet = (a: readonly string[], b: readonly string[]) => {
  const x = new Set(a.map((l) => l.toLowerCase()));
  const y = new Set(b.map((l) => l.toLowerCase()));
  return x.size === y.size && [...x].every((l) => y.has(l));
};

/** A three-way merge of two label sets against their base: adds on either side kept, removals on either side applied. */
function mergeLabels(base: readonly string[] | null, local: readonly string[], remote: readonly string[]): string[] {
  const b = new Set((base ?? []).map((l) => l.toLowerCase()));
  const has = (list: readonly string[], key: string) => list.some((l) => l.toLowerCase() === key);
  const out: string[] = [];
  for (const label of normalizeLabels([...local, ...remote])) {
    const key = label.toLowerCase();
    const inL = has(local, key);
    const inR = has(remote, key);
    // In both: kept. In one only: kept if that side added it (not in the base), else the other removed it.
    if ((inL && inR) || (!b.has(key) && (inL || inR))) out.push(label);
  }
  return out;
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
  const names = input.fields ?? TASK_FIELDS;
  const norm = (f: SyncedTaskFields): SyncedTaskFields => {
    const out: SyncedTaskFields = { ...f, ...normalizeTaskFields(f) };
    if (f.labels !== undefined) out.labels = normalizeLabels(f.labels);
    return out;
  };
  const local = norm(input.local);
  const remote = norm(input.remote);
  const base = input.base ? norm(input.base) : null;
  const l = time(input.localChangedAt);
  const r = time(input.remoteChangedAt);
  const localWins = l !== null && r !== null && l !== r ? l > r : (input.prefer ?? "local") === "local";

  const fields: SyncedTaskFields = { ...local };
  const toLocal: Partial<SyncedTaskFields> = {};
  const toRemote: Partial<SyncedTaskFields> = {};
  const conflicts: SyncedFieldName[] = [];
  const put = (target: Partial<SyncedTaskFields>, key: SyncedFieldName, value: unknown) => {
    (fields as unknown as Record<string, unknown>)[key] = value;
    (target as unknown as Record<string, unknown>)[key] = value;
  };

  for (const key of names) {
    if (key === "labels") {
      const lv = local.labels ?? [];
      const rv = remote.labels ?? [];
      if (sameSet(lv, rv)) continue;
      const merged = mergeLabels(base ? (base.labels ?? []) : null, lv, rv);
      fields.labels = merged;
      if (!sameSet(merged, lv)) toLocal.labels = merged;
      if (!sameSet(merged, rv)) toRemote.labels = merged;
      continue;
    }
    const lv = (local as unknown as Record<string, unknown>)[key] ?? null;
    const rv = (remote as unknown as Record<string, unknown>)[key] ?? null;
    if (lv === rv) continue;
    const bv = base ? ((base as unknown as Record<string, unknown>)[key] ?? null) : undefined;
    const localChanged = base === null || bv !== lv;
    const remoteChanged = base === null || bv !== rv;
    if (localChanged && !remoteChanged) put(toRemote, key, lv);
    else if (remoteChanged && !localChanged) put(toLocal, key, rv);
    else {
      conflicts.push(key);
      if (localWins) put(toRemote, key, lv);
      else put(toLocal, key, rv);
    }
  }
  return { fields, toLocal, toRemote, conflicts };
}
