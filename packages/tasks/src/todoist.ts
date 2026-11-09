// Todoist's tasks, synced the way Todoist means them to be (https://developer.todoist.com/api/v1/):
// one full read (`sync_token: "*"`), then only what changed since, with the token the last read
// handed back; writes as batched commands, each with a uuid Todoist won't run twice, so a retry
// after a timeout is safe. Never logs or returns the access token, which comes from
// genesis-connect (this package does no OAuth).
//
// What a full read leaves out: Todoist's full sync holds active data only, so a task that is done
// (or deleted) before the first read isn't in it. Absence from a full read is not a deletion: read
// a task you hold a link to with `getTodoistTask` before removing your copy.
import { isDay, isTimeZone, wallTimeIn } from "@marktiderman/genesis-core/dates";
import { normalizeLabels, type ExternalList, type ExternalTask, type SyncedTaskFields } from "./types";

const TODOIST_API = "https://api.todoist.com/api/v1";
/** Todoist runs at most 100 commands per request. */
export const TODOIST_MAX_COMMANDS = 100;
const DEFAULT_TIMEOUT_MS = 15_000;

/** Why a Todoist call failed. @stability Beta */
export type TodoistErrorCode =
  /** The access token was refused (401): get a new one, or the grant is gone. */
  | "unauthorized"
  /** The token lacks a scope, or the thing isn't the person's (403). */
  | "forbidden"
  | "not_found"
  /** Too many requests (429): wait `retryAfterSeconds`. Todoist allows 1000 partial and 100 full syncs per person per 15 minutes. */
  | "rate_limited"
  /** Todoist is busy or failing, or the request timed out: try again later. */
  | "unavailable"
  /** `signal` aborted before an answer. */
  | "aborted"
  /** Todoist refused the request as malformed (400): a retry won't help. */
  | "bad_request"
  | "bad_response";

/** A Todoist call that failed, with why. Its message never holds the token. @stability Beta */
export class TodoistError extends Error {
  readonly code: TodoistErrorCode;
  readonly status: number | null;
  /** Todoist's `error_tag` (`"INVALID_ARGUMENT_VALUE"`), when it sent one. */
  readonly tag: string | null;
  readonly retryAfterSeconds: number | null;
  readonly retryable: boolean;
  /**
   * From `runTodoistCommands`, when a later request failed: what the requests before it did
   * (each command's status, and the real ids of tasks they added). Pass `tempIds` back in on the
   * retry, so commands naming those temp ids still resolve.
   */
  partial?: TodoistCommandsResult;
  constructor(code: TodoistErrorCode, status: number | null, tag: string | null = null, retryAfterSeconds: number | null = null) {
    super(`Todoist: ${code}${status ? ` (${status})` : ""}${tag ? ` ${tag}` : ""}`);
    this.name = "TodoistError";
    this.code = code;
    this.status = status;
    this.tag = tag;
    this.retryAfterSeconds = retryAfterSeconds;
    this.retryable = code === "rate_limited" || code === "unavailable" || code === "aborted";
  }
}

/** @stability Beta */
export const isTodoistError = (e: unknown): e is TodoistError =>
  e instanceof Error && e.name === "TodoistError" && typeof (e as { code?: unknown }).code === "string";

/** Options every Todoist call takes. @stability Beta */
export interface TodoistCallOptions {
  /** From genesis-connect's `accessToken` (`todoistProvider`). */
  accessToken: string;
  fetch?: typeof fetch | undefined;
  signal?: AbortSignal | undefined;
  /** Per request. Default 15 seconds (Todoist's own limit for a standard request). */
  timeoutMs?: number | undefined;
}

/** Todoist's due object, as the API sends it. @stability Beta */
export interface TodoistDue {
  date?: string | null;
  timezone?: string | null;
  string?: string | null;
  lang?: string | null;
  is_recurring?: boolean | null;
}

/** A Todoist task (an "item") as the sync API sends it; only the fields read here. @stability Beta */
export interface TodoistItem {
  id?: string;
  project_id?: string | null;
  section_id?: string | null;
  parent_id?: string | null;
  content?: string | null;
  description?: string | null;
  priority?: number | null;
  due?: TodoistDue | null;
  labels?: string[] | null;
  responsible_uid?: string | null;
  checked?: boolean | null;
  is_deleted?: boolean | null;
  completed_at?: string | null;
  updated_at?: string | null;
  url?: string | null;
}

/** The Todoist account the token is for. @stability Beta */
export interface TodoistUser {
  /** Todoist's stable id for the account: key a connection on this, never the email. */
  id: string;
  email: string | null;
  name: string | null;
  /** The account's zone, when it is one the runtime knows. */
  timeZone: string | null;
}

async function call(
  options: TodoistCallOptions,
  path: string,
  init: { method: "GET" | "POST"; form?: Record<string, string> },
): Promise<unknown> {
  if (options.signal?.aborted) throw new TodoistError("aborted", null);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(`${TODOIST_API}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${options.accessToken}`,
        accept: "application/json",
        ...(init.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(init.form ? { body: new URLSearchParams(init.form).toString() } : {}),
      redirect: "error",
      signal,
    });
  } catch {
    throw new TodoistError(options.signal?.aborted ? "aborted" : "unavailable", null);
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const tag = typeof body?.["error_tag"] === "string" ? (body["error_tag"] as string).slice(0, 80) : null;
    const extra = body?.["error_extra"] as { retry_after?: unknown } | undefined;
    const header = Number(response.headers.get("retry-after"));
    const after = Number.isFinite(Number(extra?.retry_after)) && Number(extra?.retry_after) > 0
      ? Number(extra?.retry_after)
      : Number.isFinite(header) && header > 0 ? header : null;
    const s = response.status;
    const code: TodoistErrorCode =
      s === 401 ? "unauthorized"
      : s === 403 ? "forbidden"
      : s === 404 ? "not_found"
      : s === 429 ? "rate_limited"
      : s >= 500 || s === 408 ? "unavailable"
      : s === 400 ? "bad_request"
      : "bad_response";
    throw new TodoistError(code, s, tag, after);
  }
  if (body === null || typeof body !== "object") throw new TodoistError("bad_response", response.status);
  return body;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * A Todoist task as an `ExternalTask`, or null when it has no id. A floating due date
 * (`2026-11-10` or `2026-11-10T09:00:00`) is the owner's day as written; one fixed to a zone
 * (`…Z` with `timezone`) is read on that zone's clock (or `timeZone`, or UTC).
 *
 * @stability Beta
 */
export function fromTodoistItem(item: TodoistItem, options: { timeZone?: string | null } = {}): ExternalTask | null {
  const id = str(item.id);
  if (!id) return null;
  let dueDay: string | null = null;
  let dueTime: string | null = null;
  let dueTimeZone: string | null = null;
  const date = str(item.due?.date);
  if (date) {
    if (/Z$|[+-]\d\d:\d\d$/.test(date)) {
      const at = new Date(date);
      const zone = [item.due?.timezone, options.timeZone].find((z): z is string => isTimeZone(z)) ?? "UTC";
      if (Number.isFinite(at.getTime())) {
        const wall = wallTimeIn(zone, at);
        dueDay = wall.day;
        dueTime = wall.time.slice(0, 5);
        // A due time fixed to a zone stays fixed: the zone it was read in goes back with any
        // new day, so it is never rewritten as a floating time.
        dueTimeZone = zone;
      }
    } else {
      const day = date.slice(0, 10);
      dueDay = isDay(day) ? day : null;
      const t = /T(\d\d:\d\d)/.exec(date)?.[1];
      dueTime = dueDay && t ? t : null;
    }
  }
  const priority = Number(item.priority);
  return {
    externalId: id,
    listId: str(item.project_id),
    sectionId: str(item.section_id),
    parentId: str(item.parent_id),
    title: (item.content ?? "").trim(),
    notes: (item.description ?? "").trim(),
    dueDay,
    dueTime,
    dueTimeZone,
    dueText: str(item.due?.string),
    recurring: item.due?.is_recurring === true,
    done: item.checked === true,
    deleted: item.is_deleted === true,
    priority: priority === 2 || priority === 3 || priority === 4 ? priority : 1,
    labels: Array.isArray(item.labels) ? item.labels.filter((l): l is string => typeof l === "string") : [],
    assigneeId: str(item.responsible_uid),
    completedAt: str(item.completed_at),
    updatedAt: str(item.updated_at),
    url: str(item.url) ?? `https://app.todoist.com/app/task/${encodeURIComponent(id)}`,
  };
}

/** What `syncTodoist` takes. @stability Beta */
export interface TodoistSyncOptions extends TodoistCallOptions {
  /** The last read's token; absent or null for a full read. */
  syncToken?: string | null | undefined;
  /** What to read. Default tasks, projects and the user. */
  resourceTypes?: readonly ("items" | "projects" | "user")[] | undefined;
}

/** What `syncTodoist` read. @stability Beta */
export interface TodoistSyncResult {
  /** A full read (the first, or Todoist chose one): every active task is here; done ones may not be. */
  full: boolean;
  /** Pass it to the next read. */
  syncToken: string;
  /** Changed tasks (all active ones on a full read), deleted and done ones included as such. */
  tasks: ExternalTask[];
  /** Changed projects. */
  lists: ExternalList[];
  /** The account, when `user` was read. */
  user: TodoistUser | null;
}

/**
 * Reads Todoist: everything active the first time, then only what changed since `syncToken`.
 * Due dates fixed to a zone are read on the account's zone when the task has none of its own.
 *
 * ```ts
 * const read = await syncTodoist({ accessToken, syncToken: state.syncToken });
 * for (const task of read.tasks) task.deleted ? await removeCopy(task.externalId) : await merge(task);
 * await saveState({ syncToken: read.syncToken });
 * ```
 *
 * @stability Beta
 */
export async function syncTodoist(options: TodoistSyncOptions): Promise<TodoistSyncResult> {
  const types = options.resourceTypes ?? ["items", "projects", "user"];
  const body = (await call(options, "/sync", {
    method: "POST",
    form: { sync_token: options.syncToken || "*", resource_types: JSON.stringify(types) },
  })) as Record<string, unknown>;
  const syncToken = str(body["sync_token"]);
  if (!syncToken) throw new TodoistError("bad_response", 200);
  const rawUser = body["user"] as Record<string, unknown> | undefined;
  const tz = (rawUser?.["tz_info"] as { timezone?: unknown } | undefined)?.timezone;
  const user: TodoistUser | null =
    rawUser && str(rawUser["id"])
      ? {
          id: str(rawUser["id"])!,
          email: str(rawUser["email"]),
          name: str(rawUser["full_name"]),
          timeZone: isTimeZone(tz) ? tz : null,
        }
      : null;
  const items = Array.isArray(body["items"]) ? (body["items"] as TodoistItem[]) : [];
  const tasks = items
    .map((item) => fromTodoistItem(item, { timeZone: user?.timeZone ?? null }))
    .filter((t): t is ExternalTask => t !== null);
  const projects = Array.isArray(body["projects"]) ? (body["projects"] as Record<string, unknown>[]) : [];
  const lists: ExternalList[] = projects
    .filter((p) => str(p["id"]))
    .map((p) => ({
      externalId: str(p["id"])!,
      name: (str(p["name"]) ?? "").slice(0, 300),
      gone: p["is_deleted"] === true || p["is_archived"] === true,
      inbox: p["inbox_project"] === true,
    }));
  return { full: body["full_sync"] === true, syncToken, tasks, lists, user };
}

/**
 * One task, read on its own: for a task you hold a link to that a full read didn't include (done
 * or deleted). Null when Todoist no longer has it.
 *
 * @stability Beta
 */
export async function getTodoistTask(
  options: TodoistCallOptions & { id: string; timeZone?: string | null },
): Promise<ExternalTask | null> {
  try {
    const item = (await call(options, `/tasks/${encodeURIComponent(options.id)}`, { method: "GET" })) as TodoistItem;
    return fromTodoistItem(item, { timeZone: options.timeZone ?? null });
  } catch (error) {
    if (isTodoistError(error) && error.code === "not_found") return null;
    throw error;
  }
}

/** One write, as Todoist's sync takes it. @stability Beta */
export interface TodoistCommand {
  type: string;
  /** Todoist runs a uuid once: a command sent again with the same uuid isn't run twice. */
  uuid: string;
  temp_id?: string;
  args: Record<string, unknown>;
}

/** What `todoistCommand` builders take. @stability Beta */
export interface CommandOptions {
  /**
   * The command's uuid. Pass one derived from your own row (an outbox id), so a retry of the
   * same change sends the same uuid; a builder that makes several commands keeps it for the first
   * and suffixes the rest (`:0`, `:1`, …).
   * Default a random one.
   */
  uuid?: string | undefined;
}

const uuids = (base: string | undefined) => {
  const root = base ?? crypto.randomUUID();
  let n = 0;
  return () => (n++ === 0 ? root : `${root}:${n - 1}`);
};

/** The due object for a day, keeping the time (and zone) the task already had. */
function dueFor(day: string, current: ExternalTask | null | undefined): Record<string, unknown> {
  if (!current?.dueTime) return { date: day };
  return current.dueTimeZone
    ? { date: `${day}T${current.dueTime}:00`, timezone: current.dueTimeZone }
    : { date: `${day}T${current.dueTime}:00` };
}

/**
 * Builds Todoist sync commands from the shared fields. Each returns the commands to send, in order.
 *
 * - `add` makes a task (and closes it at once when `done`), under `tempId` so later commands in
 *   the same batch, and `temp_id_mapping`, can name it.
 * - `update` sends only what changed: the text in one `item_update`, then `item_close` or
 *   `item_uncomplete` for `done`. A new `dueDay` keeps the time of day the task had. A repeating
 *   task's due day is Todoist's (completing moves it on): `dueDay` isn't written to one, and
 *   `done: true` closes this occurrence and moves it to the next.
 *
 * @stability Beta
 */
export const todoistCommand = {
  add(
    fields: SyncedTaskFields,
    options: CommandOptions & { tempId: string; listId?: string | null; sectionId?: string | null; parentId?: string | null },
  ): TodoistCommand[] {
    const next = uuids(options.uuid);
    const args: Record<string, unknown> = { content: fields.title.trim() };
    if (fields.notes.trim()) args["description"] = fields.notes.trim();
    if (fields.dueDay) args["due"] = { date: fields.dueDay };
    if (fields.labels?.length) args["labels"] = normalizeLabels(fields.labels);
    if (fields.priority && fields.priority !== 1) args["priority"] = fields.priority;
    if (options.listId) args["project_id"] = options.listId;
    if (options.sectionId) args["section_id"] = options.sectionId;
    if (options.parentId) args["parent_id"] = options.parentId;
    const out: TodoistCommand[] = [{ type: "item_add", uuid: next(), temp_id: options.tempId, args }];
    if (fields.done) out.push({ type: "item_close", uuid: next(), args: { id: options.tempId } });
    return out;
  },

  update(
    id: string,
    changes: Partial<SyncedTaskFields>,
    options: CommandOptions & { current?: ExternalTask | null } = {},
  ): TodoistCommand[] {
    const next = uuids(options.uuid);
    const args: Record<string, unknown> = {};
    if (changes.title !== undefined && changes.title.trim()) args["content"] = changes.title.trim();
    if (changes.notes !== undefined) args["description"] = changes.notes.trim();
    if (changes.dueDay !== undefined && !options.current?.recurring)
      args["due"] = changes.dueDay ? dueFor(changes.dueDay, options.current) : null;
    // Labels are sent whole: Todoist replaces the task's list with this one.
    if (changes.labels !== undefined) args["labels"] = normalizeLabels(changes.labels);
    if (changes.priority !== undefined) args["priority"] = changes.priority;
    const out: TodoistCommand[] = [];
    if (Object.keys(args).length) out.push({ type: "item_update", uuid: next(), args: { id, ...args } });
    if (changes.done === true) out.push({ type: "item_close", uuid: next(), args: { id } });
    if (changes.done === false && !options.current?.recurring)
      out.push({ type: "item_uncomplete", uuid: next(), args: { id } });
    return out;
  },

  /** Deletes a task and its sub-tasks (needs the `data:delete` scope). */
  remove(id: string, options: CommandOptions = {}): TodoistCommand[] {
    return [{ type: "item_delete", uuid: uuids(options.uuid)(), args: { id } }];
  },

  /** Moves a task to another project. */
  move(id: string, listId: string, options: CommandOptions = {}): TodoistCommand[] {
    return [{ type: "item_move", uuid: uuids(options.uuid)(), args: { id, project_id: listId } }];
  },

  /** Makes a project, under `tempId`. */
  addList(name: string, options: CommandOptions & { tempId: string }): TodoistCommand[] {
    return [{ type: "project_add", uuid: uuids(options.uuid)(), temp_id: options.tempId, args: { name: name.slice(0, 120) } }];
  },
};

/** How one command went. @stability Beta */
export type TodoistCommandStatus =
  | { ok: true }
  | {
      ok: false;
      /** Todoist's `error_tag` (`"ITEM_NOT_FOUND"`), or `"UNKNOWN"`. */
      tag: string;
      status: number | null;
      /** Worth sending again (Todoist's 429 or 5xx); a 400 never is. */
      retryable: boolean;
    };

/** What `runTodoistCommands` did. @stability Beta */
export interface TodoistCommandsResult {
  /** Each command's result, by its uuid. A command Todoist didn't answer for isn't here. */
  status: Record<string, TodoistCommandStatus>;
  /** The real id of each `temp_id`. */
  tempIds: Record<string, string>;
}

/**
 * Sends commands, at most 100 per request, in order, and reports each one. A request that fails
 * as a whole throws a `TodoistError` whose `partial` holds what the requests before it did (their
 * statuses and the real ids of tasks they added). Sending the same commands again (same uuids)
 * is safe, since Todoist runs a uuid once; pass `partial.tempIds` as `tempIds` so commands that
 * name an earlier batch's `temp_id` still resolve. Commands that name a `temp_id` from an earlier
 * batch are rewritten to its real id.
 *
 * @stability Beta
 */
export async function runTodoistCommands(
  options: TodoistCallOptions & {
    commands: readonly TodoistCommand[];
    /** Temp ids already resolved, from an earlier attempt's `partial.tempIds`. */
    tempIds?: Readonly<Record<string, string>> | undefined;
  },
): Promise<TodoistCommandsResult> {
  const status: Record<string, TodoistCommandStatus> = {};
  const tempIds: Record<string, string> = { ...options.tempIds };
  const resolve = (value: unknown) => (typeof value === "string" && tempIds[value] ? tempIds[value] : value);
  for (let i = 0; i < options.commands.length; i += TODOIST_MAX_COMMANDS) {
    const batch = options.commands.slice(i, i + TODOIST_MAX_COMMANDS).map((c) => ({
      ...c,
      args: Object.fromEntries(
        Object.entries(c.args).map(([k, v]) => [k, k === "id" || k.endsWith("_id") ? resolve(v) : v]),
      ),
    }));
    let body: Record<string, unknown>;
    try {
      body = (await call(options, "/sync", {
        method: "POST",
        form: { commands: JSON.stringify(batch) },
      })) as Record<string, unknown>;
    } catch (error) {
      // Keep what the requests before this one did: the real ids of tasks they added are known
      // nowhere else.
      if (isTodoistError(error)) error.partial = { status: { ...status }, tempIds: { ...tempIds } };
      throw error;
    }
    const mapping = (body["temp_id_mapping"] ?? {}) as Record<string, unknown>;
    for (const [temp, real] of Object.entries(mapping)) if (typeof real === "string") tempIds[temp] = real;
    const results = (body["sync_status"] ?? {}) as Record<string, unknown>;
    for (const command of batch) {
      const result = results[command.uuid];
      if (result === undefined) continue;
      if (result === "ok") {
        status[command.uuid] = { ok: true };
        continue;
      }
      const r = (result ?? {}) as Record<string, unknown>;
      const http = Number(r["http_code"]);
      status[command.uuid] = {
        ok: false,
        tag: typeof r["error_tag"] === "string" ? (r["error_tag"] as string).slice(0, 80) : "UNKNOWN",
        status: Number.isFinite(http) ? http : null,
        retryable: http === 429 || http >= 500,
      };
    }
  }
  return { status, tempIds };
}

/** Which outside tasks a sync takes in. @stability Beta */
export interface TaskScope {
  /** Lists (projects) a task must be in; absent or empty for any. */
  lists?: readonly string[] | undefined;
  /** Labels a task must carry, compared without case; absent or empty for any. */
  labels?: readonly string[] | undefined;
  /** `any` (the default) or `all` of `labels`. */
  labelsMode?: "any" | "all" | undefined;
  /** Only tasks assigned to this user, or to nobody (a task in a personal project has no assignee). */
  assignedTo?: string | undefined;
}

/**
 * Whether an outside task is in a sync's scope: in one of its lists, with its labels, and (in a
 * shared project) assigned to the person or to nobody.
 *
 * @stability Beta
 */
export function matchesScope(task: ExternalTask, scope: TaskScope): boolean {
  if (scope.lists?.length && (!task.listId || !scope.lists.includes(task.listId))) return false;
  if (scope.labels?.length) {
    const have = new Set(task.labels.map((l) => l.trim().toLowerCase()));
    const want = scope.labels.map((l) => l.trim().toLowerCase()).filter(Boolean);
    const ok = scope.labelsMode === "all" ? want.every((l) => have.has(l)) : want.some((l) => have.has(l));
    if (!ok) return false;
  }
  if (scope.assignedTo && task.assigneeId && task.assigneeId !== scope.assignedTo) return false;
  return true;
}

