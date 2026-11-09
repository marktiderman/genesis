# @marktiderman/genesis-tasks

The task sync layer: a person's tasks kept equal with an outside list, both ways, without losing
an edit on either side. Todoist is built in.

- **`TaskFields`**: what a two-way sync keeps equal (title, notes, due day, done). Everything else
  on the outside task (priority, labels, a due time, a recurrence) stays the outside list's and
  is never written from your side.
- **`mergeTask`**: a three-way merge, field by field, against the last state both sides agreed on.
  A title changed in the app and the task ticked off in Todoist keeps both.
- **Todoist**: `syncTodoist` (a full read, then only changes, with the sync token),
  `runTodoistCommands` with `todoistCommand` (batched, at most 100 a request, each with a uuid
  Todoist runs once, so retrying is safe), `getTodoistTask`, and `readTodoistWebhook` (the
  signature checked on the raw body).

Pure TypeScript on fetch and WebCrypto: no storage, no OAuth, no React. The access token comes
from genesis-connect's `todoistProvider` (see its README, "Connect Todoist"). Server only: the
token never reaches a browser.

## A two-way sync

```ts
import { createConnector, createSecrets, todoistProvider, TODOIST_SCOPES } from "@marktiderman/genesis-connect";
import { mergeTask, runTodoistCommands, syncTodoist, todoistCommand } from "@marktiderman/genesis-tasks";

// Read what changed since the last sync (everything active, the first time).
const read = await syncTodoist({ accessToken, syncToken: state.syncToken });

for (const remote of read.tasks) {
  const link = await links.byExternalId(remote.externalId);
  if (!link) continue; // or import it
  if (remote.deleted) {
    await tasks.remove(link.taskId);
    continue;
  }
  const local = await tasks.get(link.taskId);
  const merged = mergeTask({
    base: link.base, // the fields stored after the last sync
    local: local.fields,
    remote,
    localChangedAt: local.updatedAt,
    remoteChangedAt: remote.updatedAt,
  });
  if (Object.keys(merged.toLocal).length) await tasks.update(link.taskId, merged.toLocal);
  if (Object.keys(merged.toRemote).length)
    await runTodoistCommands({
      accessToken,
      commands: todoistCommand.update(remote.externalId, merged.toRemote, { current: remote, uuid: link.changeId }),
    });
  await links.saveBase(link.id, merged.fields);
}
await state.save({ syncToken: read.syncToken });
```

### What to know about Todoist

- **A full read holds active tasks only.** A task done or deleted before the first read isn't in
  it, so absence is not a deletion: read a task you hold a link to with `getTodoistTask` (null
  when Todoist has none) before removing your copy.
- **Command uuids make writes safe to retry.** Todoist runs a uuid once. Derive it from your own
  row (an outbox id) and send the same commands again after a timeout or a 5xx; a builder that
  makes several commands keeps it for the first and suffixes the rest (`:0`, `:1`, …). Each command's result is in `status`, by uuid:
  a `retryable: false` failure (a 400, `ITEM_NOT_FOUND`) won't go better on a retry.
- **A request that fails part-way** throws a `TodoistError` whose `partial` holds what the earlier
  requests did, including the real ids of tasks they added. Retry with the same commands and
  `tempIds: error.partial.tempIds`.
- **Temp ids.** `todoistCommand.add` names the new task by `tempId`; later commands in the same
  call may use it, across batches too, and `tempIds` maps it to the real id.
- **Repeating tasks.** Completing one moves its due day on, and it stays open. `update` never
  writes `dueDay` to a repeating task (Todoist owns its schedule), and `done: true` closes this
  occurrence. The next sync brings the new due day back. So for a repeating task, store the base's
  `dueDay` (and a reopen) as Todoist holds them, not as the merge wrote them: `update` dropped them,
  and a base that says otherwise would undo the edit on the next merge.
- **A due time is kept.** A new `dueDay` keeps the time of day (and zone) the task had, given
  `current`. A due time fixed to a zone is read on that zone's clock (`dueDay`, `dueTime`).
- **Limits.** 1000 partial and 100 full syncs per person per 15 minutes; `rate_limited` errors
  carry `retryAfterSeconds`. Errors are `TodoistError`s (`isTodoistError`) with a `code`
  (`unauthorized`, `forbidden`, `not_found`, `rate_limited`, `unavailable`, `aborted`,
  `bad_request`, `bad_response`) and `retryable`; none holds the token.
- **Scopes.** `data:read_write` reads and changes tasks; `todoistCommand.remove` also needs
  `data:delete`.

## Labels, priority and scope

A sync can keep labels and priority equal too: pass them in `fields`.

```ts
const merged = mergeTask({ base, local, remote, fields: ["title", "notes", "dueDay", "done", "labels", "priority"] });
```

- **Labels merge as a set**, compared without case: a label added on either side is kept, and one
  removed on either side goes, so a label added here and another added in Todoist both stay.
  `normalizeLabels` trims, drops empties and keeps one of each.
- **Priority** merges like any field (1 normal to 4 most urgent: Todoist's API scale, where 4 is
  what the app shows as p1).
- `todoistCommand.add` and `.update` write `labels` (the whole list: Todoist replaces it) and
  `priority`.
- `matchesScope(task, { lists, labels, labelsMode, assignedTo })` says whether an outside task is
  in a sync's scope. In a shared project, only tasks assigned to the person (or to nobody) match
  `assignedTo`; `ExternalTask.assigneeId` is Todoist's `responsible_uid`.

## Webhooks

Todoist sends a webhook for each change to a person who connected the app (configure the URL and
events in its App Management Console). Deliveries can come late, out of order or not at all, and
are sent again (same `X-Todoist-Delivery-ID`) after 15 minutes unless the answer is a 200. Use one
as a nudge to sync that account, never as the data:

```ts
import { readTodoistWebhook } from "@marktiderman/genesis-tasks";

export async function POST(request: Request) {
  const read = await readTodoistWebhook(request, { clientSecret: process.env.TODOIST_CLIENT_SECRET! });
  if (!read.ok) return new Response(null, { status: read.status }); // 401: bad signature
  await queueSync({ todoistUserId: read.event.userId, deliveryId: read.event.deliveryId });
  return new Response(null, { status: 200 });
}
```

The signature (base64 HMAC-SHA256 of the raw body under the client secret) is compared in
constant time. Keep running a periodic sync as well, since a webhook can be lost.

## The merge

`mergeTask({ base, local, remote, localChangedAt, remoteChangedAt, prefer })` compares each shared
field with `base`:

| Local vs base | Remote vs base | Result |
| --- | --- | --- |
| same | same | nothing to write |
| changed | same | local's value, in `toRemote` |
| same | changed | remote's value, in `toLocal` |
| changed | changed (differently) | a conflict: the side that changed last, or `prefer` (default `"local"`) when the times don't tell |

With no `base` (a pair never synced), every differing field is a conflict. Store `fields` as the
next base once both sides are written. Fields are compared trimmed, so whitespace isn't a change.
