// @feat:task-sync-layer
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { mergeTask } from "./merge";
import {
  fromTodoistItem,
  getTodoistTask,
  runTodoistCommands,
  syncTodoist,
  todoistCommand,
  TodoistError,
  type TodoistCommand,
} from "./todoist";
import type { ExternalTask, TaskFields } from "./types";
import { readTodoistWebhook } from "./webhook";
import { matchesScope } from "./todoist";
import { normalizeLabels } from "./types";

const TOKEN = "todoist-access-token-value";

function fake(handler: (body: URLSearchParams, url: string) => Response) {
  const calls: { url: string; body: URLSearchParams; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const body = new URLSearchParams(String(init.body ?? ""));
    calls.push({ url: String(url), body, init });
    return handler(body, String(url));
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const fields = (over: Partial<TaskFields> = {}): TaskFields => ({
  title: "Write the plan",
  notes: "",
  dueDay: "2026-11-10",
  done: false,
  ...over,
});

describe("fromTodoistItem", () => {
  it("reads a floating day, a floating time, and a time fixed to a zone on that zone's clock", () => {
    expect(fromTodoistItem({ id: "1", content: " A ", due: { date: "2026-11-10" } })).toMatchObject({
      title: "A",
      dueDay: "2026-11-10",
      dueTime: null,
      priority: 1,
      url: "https://app.todoist.com/app/task/1",
    });
    expect(fromTodoistItem({ id: "2", content: "B", due: { date: "2026-11-10T09:30:00" } })).toMatchObject({
      dueDay: "2026-11-10",
      dueTime: "09:30",
      dueTimeZone: null,
    });
    // 03:00 UTC on the 11th is the evening of the 10th in New York.
    expect(
      fromTodoistItem({ id: "3", content: "C", due: { date: "2026-11-11T03:00:00Z", timezone: "America/New_York" } }),
    ).toMatchObject({ dueDay: "2026-11-10", dueTime: "22:00", dueTimeZone: "America/New_York" });
    expect(fromTodoistItem({ content: "no id" })).toBeNull();
  });

  it("keeps done, deleted, recurring, priority and labels as Todoist says", () => {
    expect(
      fromTodoistItem({
        id: "4",
        content: "Run",
        checked: true,
        is_deleted: true,
        priority: 4,
        labels: ["health", 3 as unknown as string],
        due: { date: "2026-11-10", is_recurring: true, string: "every day" },
      }),
    ).toMatchObject({ done: true, deleted: true, priority: 4, labels: ["health"], recurring: true, dueText: "every day" });
  });
});

describe("syncTodoist", () => {
  it("reads in full with *, then with the token, and reads the user's zone for fixed due times", async () => {
    const t = fake((body) =>
      Response.json({
        sync_token: body.get("sync_token") === "*" ? "t1" : "t2",
        full_sync: body.get("sync_token") === "*",
        items: [{ id: "1", content: "A", due: { date: "2026-11-11T03:00:00Z" } }],
        projects: [{ id: "p", name: "Inbox", inbox_project: true }],
        user: { id: "99", email: "a@example.com", full_name: "A", tz_info: { timezone: "America/New_York" } },
      }),
    );
    const first = await syncTodoist({ accessToken: TOKEN, fetch: t.fetch });
    expect(first).toMatchObject({ full: true, syncToken: "t1", user: { id: "99", timeZone: "America/New_York" } });
    expect(first.tasks[0]).toMatchObject({ dueDay: "2026-11-10" });
    expect(first.lists).toEqual([{ externalId: "p", name: "Inbox", gone: false, inbox: true }]);
    const second = await syncTodoist({ accessToken: TOKEN, syncToken: "t1", fetch: t.fetch });
    expect(second.full).toBe(false);
    expect(t.calls[1]!.body.get("sync_token")).toBe("t1");
    expect(JSON.parse(t.calls[0]!.body.get("resource_types")!)).toEqual(["items", "projects", "user"]);
    expect((t.calls[0]!.init.headers as Record<string, string>)["authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(t.calls[0]!.init.redirect).toBe("error");
  });

  it("throws typed errors that never hold the token", async () => {
    const cases: [Response, string, boolean][] = [
      [Response.json({ error_tag: "AUTH_INVALID_TOKEN" }, { status: 401 }), "unauthorized", false],
      [Response.json({}, { status: 403 }), "forbidden", false],
      [Response.json({ error_extra: { retry_after: 20 } }, { status: 429 }), "rate_limited", true],
      [new Response("busy", { status: 503 }), "unavailable", true],
      [Response.json({ error_tag: "INVALID_ARGUMENT_VALUE" }, { status: 400 }), "bad_request", false],
      [Response.json({ full_sync: true }), "bad_response", false],
    ];
    for (const [response, code, retryable] of cases) {
      const error = (await syncTodoist({ accessToken: TOKEN, fetch: fake(() => response).fetch }).catch(
        (e: unknown) => e,
      )) as TodoistError;
      expect(error).toBeInstanceOf(TodoistError);
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(retryable);
      if (code === "rate_limited") expect(error.retryAfterSeconds).toBe(20);
      expect(error.message).not.toContain(TOKEN);
    }
    const network = (await syncTodoist({
      accessToken: TOKEN,
      fetch: (async () => {
        throw new TypeError(`fetch failed ${TOKEN}`);
      }) as unknown as typeof fetch,
    }).catch((e: unknown) => e)) as TodoistError;
    expect(network.code).toBe("unavailable");
    expect(network.message).not.toContain(TOKEN);
    const controller = new AbortController();
    controller.abort();
    await expect(syncTodoist({ accessToken: TOKEN, signal: controller.signal, fetch: fake(() => Response.json({})).fetch })).rejects.toMatchObject({
      code: "aborted",
    });
  });

  it("getTodoistTask reads one task, and null when Todoist has none", async () => {
    const t = fake((_b, url) => (url.endsWith("/tasks/1") ? Response.json({ id: "1", content: "A", checked: true }) : Response.json({}, { status: 404 })));
    expect(await getTodoistTask({ accessToken: TOKEN, id: "1", fetch: t.fetch })).toMatchObject({ done: true });
    expect(await getTodoistTask({ accessToken: TOKEN, id: "2", fetch: t.fetch })).toBeNull();
  });
});

describe("todoistCommand", () => {
  const current = (over: Partial<ExternalTask>): ExternalTask => ({
    ...fromTodoistItem({ id: "9", content: "x" })!,
    ...over,
  });

  it("adds a task under a temp id, and closes it at once when it is already done", () => {
    const commands = todoistCommand.add(fields({ notes: " why ", done: true }), { tempId: "tmp", uuid: "row-1", listId: "p" });
    expect(commands).toEqual([
      { type: "item_add", uuid: "row-1", temp_id: "tmp", args: { content: "Write the plan", description: "why", due: { date: "2026-11-10" }, project_id: "p" } },
      { type: "item_close", uuid: "row-1:1", args: { id: "tmp" } },
    ]);
  });

  it("updates only what changed, keeps the time of day, and leaves a repeating task's date to Todoist", () => {
    expect(todoistCommand.update("9", { title: "New" }, { uuid: "u" })).toEqual([
      { type: "item_update", uuid: "u", args: { id: "9", content: "New" } },
    ]);
    expect(todoistCommand.update("9", { dueDay: "2026-11-12" }, { current: current({ dueTime: "09:30" }) })[0]!.args).toEqual({
      id: "9",
      due: { date: "2026-11-12T09:30:00" },
    });
    expect(
      todoistCommand.update("9", { dueDay: "2026-11-12" }, { current: current({ dueTime: "22:00", dueTimeZone: "America/New_York" }) })[0]!.args,
    ).toEqual({ id: "9", due: { date: "2026-11-12T22:00:00", timezone: "America/New_York" } });
    expect(todoistCommand.update("9", { dueDay: null })[0]!.args).toEqual({ id: "9", due: null });
    expect(todoistCommand.update("9", { dueDay: "2026-11-12", done: true }, { current: current({ recurring: true }) })).toEqual([
      expect.objectContaining({ type: "item_close", args: { id: "9" } }),
    ]);
    expect(todoistCommand.update("9", { done: false }).map((c) => c.type)).toEqual(["item_uncomplete"]);
    expect(todoistCommand.update("9", {})).toEqual([]);
  });
});

describe("runTodoistCommands", () => {
  it("sends at most 100 per request, maps temp ids across batches and reports each command", async () => {
    const t = fake((body) => {
      const commands = JSON.parse(body.get("commands")!) as TodoistCommand[];
      const status: Record<string, unknown> = {};
      const mapping: Record<string, string> = {};
      for (const c of commands) {
        status[c.uuid] = c.args["id"] === "missing" ? { error_tag: "ITEM_NOT_FOUND", http_code: 404 } : "ok";
        if (c.temp_id) mapping[c.temp_id] = `real-${c.temp_id}`;
      }
      return Response.json({ sync_status: status, temp_id_mapping: mapping });
    });
    const commands: TodoistCommand[] = [
      ...todoistCommand.add(fields(), { tempId: "t0", uuid: "a" }),
      ...Array.from({ length: 99 }, (_, i) => todoistCommand.update(`id-${i}`, { title: `T${i}` }, { uuid: `u${i}` })[0]!),
      ...todoistCommand.update("t0", { done: true }, { uuid: "close" }),
      ...todoistCommand.remove("missing", { uuid: "gone" }),
    ];
    const result = await runTodoistCommands({ accessToken: TOKEN, commands, fetch: t.fetch });
    expect(t.calls).toHaveLength(2);
    expect(JSON.parse(t.calls[0]!.body.get("commands")!)).toHaveLength(100);
    // The close in the second batch names the real id the first batch made.
    expect(JSON.parse(t.calls[1]!.body.get("commands")!)[0].args.id).toBe("real-t0");
    expect(result.tempIds).toEqual({ t0: "real-t0" });
    expect(result.status["a"]).toEqual({ ok: true });
    expect(result.status["gone"]).toEqual({ ok: false, tag: "ITEM_NOT_FOUND", status: 404, retryable: false });
  });
});

describe("mergeTask", () => {
  const base = fields();

  it("keeps an edit on each side: a title changed here and the task ticked off there", () => {
    const result = mergeTask({ base, local: fields({ title: "Plan v2" }), remote: fields({ done: true }) });
    expect(result.fields).toEqual(fields({ title: "Plan v2", done: true }));
    expect(result.toRemote).toEqual({ title: "Plan v2" });
    expect(result.toLocal).toEqual({ done: true });
    expect(result.conflicts).toEqual([]);
  });

  it("decides a field both changed by who changed last, then by prefer", () => {
    const both = { base, local: fields({ title: "Here" }), remote: fields({ title: "There" }) };
    expect(mergeTask({ ...both, localChangedAt: "2026-11-09T10:00:00Z", remoteChangedAt: "2026-11-09T11:00:00Z" })).toMatchObject({
      toLocal: { title: "There" },
      toRemote: {},
      conflicts: ["title"],
    });
    expect(mergeTask({ ...both, localChangedAt: new Date("2026-11-09T12:00:00Z"), remoteChangedAt: "2026-11-09T11:00:00Z" }).toRemote).toEqual({
      title: "Here",
    });
    expect(mergeTask(both).toRemote).toEqual({ title: "Here" });
    expect(mergeTask({ ...both, prefer: "remote" }).toLocal).toEqual({ title: "There" });
  });

  it("writes nothing when both sides agree, whitespace and empty notes included", () => {
    expect(mergeTask({ base: null, local: fields({ title: " Write the plan " }), remote: fields() })).toEqual({
      fields: fields(),
      toLocal: {},
      toRemote: {},
      conflicts: [],
    });
  });

  it("with no base, differing fields are conflicts decided by time", () => {
    const result = mergeTask({
      base: null,
      local: fields({ dueDay: null }),
      remote: fields(),
      localChangedAt: "2026-11-09T09:00:00Z",
      remoteChangedAt: "2026-11-09T10:00:00Z",
    });
    expect(result).toMatchObject({ toLocal: { dueDay: "2026-11-10" }, conflicts: ["dueDay"] });
  });
});

describe("readTodoistWebhook", () => {
  const SECRET = "client-secret";
  const event = {
    event_name: "item:completed",
    user_id: "2671355",
    event_data: { id: "6XR4GqQQCW6Gv9h4", content: "Buy Milk", checked: true, project_id: "p" },
    initiator: { id: "2671355" },
    triggered_at: "2025-02-10T10:39:38.000000Z",
    version: "10",
  };
  const request = (body: string, signature: string | null) =>
    new Request("https://app.example.com/api/connect/todoist/webhook", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-todoist-delivery-id": "delivery-1",
        ...(signature ? { "x-todoist-hmac-sha256": signature } : {}),
      },
    });
  const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("base64");

  it("reads a signed delivery", async () => {
    const body = JSON.stringify(event);
    const read = await readTodoistWebhook(request(body, sign(body)), { clientSecret: SECRET });
    expect(read).toMatchObject({
      ok: true,
      event: { name: "item:completed", userId: "2671355", deliveryId: "delivery-1", initiatorId: "2671355", task: { externalId: "6XR4GqQQCW6Gv9h4", done: true } },
    });
  });

  it("refuses a missing or wrong signature (401) and a body that isn't an event (400)", async () => {
    const body = JSON.stringify(event);
    expect(await readTodoistWebhook(request(body, null), { clientSecret: SECRET })).toEqual({ ok: false, status: 401 });
    expect(await readTodoistWebhook(request(body, sign(body, "other")), { clientSecret: SECRET })).toEqual({ ok: false, status: 401 });
    expect(await readTodoistWebhook(request(`${body} `, sign(body)), { clientSecret: SECRET })).toEqual({ ok: false, status: 401 });
    expect(await readTodoistWebhook(request(body, sign(body)), { clientSecret: "" })).toEqual({ ok: false, status: 401 });
    const notEvent = JSON.stringify({ hello: 1 });
    expect(await readTodoistWebhook(request(notEvent, sign(notEvent)), { clientSecret: SECRET })).toEqual({ ok: false, status: 400 });
    expect(await readTodoistWebhook(request("not json", sign("not json")), { clientSecret: SECRET })).toEqual({ ok: false, status: 400 });
  });
});

describe("labels and priority", () => {
  const withExtra = (over: Record<string, unknown> = {}) => ({ ...fields(), labels: ["growth90"], priority: 1 as const, ...over });
  const both = ["title", "notes", "dueDay", "done", "labels", "priority"] as const;

  it("merges labels as a set: a label added on each side keeps both, one removed on either side goes", () => {
    const base = withExtra({ labels: ["growth90", "health"] });
    const result = mergeTask({
      base,
      local: withExtra({ labels: ["growth90", "health", "Coaching"] }),
      remote: withExtra({ labels: ["growth90", "errands"] }),
      fields: both,
    });
    expect(result.fields.labels).toEqual(["growth90", "Coaching", "errands"]);
    expect(result.toLocal.labels).toEqual(["growth90", "Coaching", "errands"]);
    expect(result.toRemote.labels).toEqual(["growth90", "Coaching", "errands"]);
  });

  it("compares labels without case, and ignores them unless asked", () => {
    expect(mergeTask({ base: null, local: withExtra({ labels: ["Health"] }), remote: withExtra({ labels: ["health"] }), fields: both }).toRemote).toEqual({});
    expect(mergeTask({ base: null, local: withExtra({ labels: ["a"] }), remote: withExtra({ labels: ["b"] }) }).toRemote).toEqual({});
    expect(normalizeLabels([" a ", "A", "", "b"])).toEqual(["a", "b"]);
  });

  it("merges priority like any field", () => {
    const result = mergeTask({ base: withExtra(), local: withExtra(), remote: withExtra({ priority: 4 }), fields: both });
    expect(result.toLocal).toEqual({ priority: 4 });
  });

  it("writes labels whole and priority in commands", () => {
    expect(todoistCommand.update("9", { labels: ["growth90", " Coaching "], priority: 3 })[0]!.args).toEqual({ id: "9", labels: ["growth90", "Coaching"], priority: 3 });
    expect(todoistCommand.add({ ...fields(), labels: ["growth90"], priority: 4 }, { tempId: "t" })[0]!.args).toMatchObject({ labels: ["growth90"], priority: 4 });
  });
});

describe("matchesScope", () => {
  const t = (over: Record<string, unknown>) => fromTodoistItem({ id: "1", content: "A", project_id: "p", ...over })!;

  it("checks lists, labels (any or all) and the assignee", () => {
    expect(matchesScope(t({}), { lists: ["p"] })).toBe(true);
    expect(matchesScope(t({}), { lists: ["q"] })).toBe(false);
    expect(matchesScope(t({ labels: ["Coaching"] }), { labels: ["coaching", "x"] })).toBe(true);
    expect(matchesScope(t({ labels: ["Coaching"] }), { labels: ["coaching", "x"], labelsMode: "all" })).toBe(false);
    expect(matchesScope(t({ responsible_uid: "me" }), { assignedTo: "me" })).toBe(true);
    expect(matchesScope(t({ responsible_uid: "you" }), { assignedTo: "me" })).toBe(false);
    expect(matchesScope(t({}), { assignedTo: "me" })).toBe(true);
  });
});

