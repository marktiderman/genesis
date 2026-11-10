/**
 * @marktiderman/genesis-tasks: the task sync layer. A person's tasks kept equal with an outside
 * list: the shared fields (`TaskFields`), a three-way merge that never loses an edit
 * (`mergeTask`), and Todoist's adapter: incremental sync with its token, batched commands that
 * are safe to retry, and checked webhooks. Pure TypeScript: no storage, no OAuth (that is
 * genesis-connect's `todoistProvider`), no React.
 *
 * @packageDocumentation
 */
export {
  normalizeLabels,
  normalizeTaskFields,
  TASK_FIELDS,
  type ExternalList,
  type ExternalTask,
  type ExtraTaskFields,
  type SyncedFieldName,
  type SyncedTaskFields,
  type TaskFields,
} from "./types";
export { mergeTask, type MergeTaskInput, type MergeTaskResult } from "./merge";
export {
  fromTodoistItem,
  getTodoistTask,
  isTodoistError,
  matchesScope,
  runTodoistCommands,
  syncTodoist,
  todoistCommand,
  TodoistError,
  TODOIST_MAX_COMMANDS,
  type CommandOptions,
  type TodoistCallOptions,
  type TodoistCommand,
  type TodoistCommandsResult,
  type TodoistCommandStatus,
  type TodoistDue,
  type TodoistErrorCode,
  type TodoistItem,
  type TodoistSyncOptions,
  type TodoistSyncResult,
  type TodoistUser,
  type TaskScope,
} from "./todoist";
export { readTodoistWebhook, type TodoistWebhookEvent, type TodoistWebhookResult } from "./webhook";
