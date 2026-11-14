// @feat:view-inbox @feat:support-chat
/**
 * The agent queue's ready-made inbox: ticketInbox and ticketSegments are a view `defineView`
 * accepts, and supportQueueSource reads every ticket through support_agent_queue with the tenant
 * and the queue taken from the list's filters (and left out of the query).
 */
import { describe, expect, it } from "vitest";
import { createSupabaseProvider, defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { supportQueueSource, TICKET_STATUS_TONES, ticketInbox, ticketSegments } from "../inbox";

type QueueRow = { id: string; tenant_id: string; title: string; preview: string | null; activity_at: string; requester_name: string | null; agent_unread: boolean; status: string };

const queue = defineResource<QueueRow>()({
  name: "support_queue",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string" },
    { name: "tenant_id", type: "string" },
    { name: "title", type: "string" },
    { name: "preview", type: "string", nullable: true },
    { name: "activity_at", type: "datetime" },
    { name: "requester_name", type: "string", nullable: true },
    { name: "agent_unread", type: "boolean" },
    { name: "status", type: "string", enumValues: ["open", "submitted", "in_progress", "pending", "addressed", "wont_fix"] },
  ],
});

const view = defineView(queue, {
  fields: { status: { tones: TICKET_STATUS_TONES } },
  inbox: ticketInbox,
  segments: ticketSegments,
  scope: ["tenant_id"],
  types: ["inbox", "table"],
});

describe("the agent queue's inbox blocks", () => {
  it("make a view: its rows draw as an inbox, Mine and Unassigned pass the queue, the rest filter by status", () => {
    expect(view.types()).toEqual(["inbox", "table"]);
    expect(view.inboxRow({ id: "t1", tenant_id: "ta", title: "Can't sign in", preview: "The code never arrives", activity_at: "2026-11-13T09:00:00Z", requester_name: "Ada", agent_unread: true, status: "open" })).toEqual({
      id: "t1",
      title: "Can't sign in",
      unread: true,
      preview: "The code never arrives",
      time: "2026-11-13T09:00:00Z",
      from: "Ada",
      badge: { label: "Open", tone: "info" },
    });
    expect(view.segmentFilters("mine")).toEqual([{ field: "inbox_view", operator: "eq", value: "mine" }]);
    expect(view.segmentFilters("unassigned")).toEqual([{ field: "inbox_view", operator: "eq", value: "unassigned" }]);
    // Pending and Closed are the queue's own views too, as SupportAgentInbox has them, so a pending
    // ticket stays reachable while Mine and Unassigned leave it out.
    expect(view.segments().map((s) => s.id)).toEqual(["mine", "unassigned", "open", "pending", "closed", "all"]);
    expect(view.segmentFilters("pending")).toEqual([{ field: "inbox_view", operator: "eq", value: "pending" }]);
    expect(view.segmentFilters("closed")).toEqual([{ field: "inbox_view", operator: "eq", value: "closed" }]);
    expect(view.segmentFilters("open")).toEqual([{ field: "status", operator: "in", value: ["open", "submitted", "in_progress"] }]);
    expect(view.inboxRow({ id: "t2", tenant_id: "ta", title: "Waiting", preview: null, activity_at: "2026-11-13T09:00:00Z", requester_name: "Bo", agent_unread: false, status: "pending" }).badge).toEqual({ label: "Pending", tone: "muted" });
    expect(view.segmentFilters("all")).toEqual([]);
  });

  it("read through support_agent_queue with the tenant and queue as arguments, left out of the query", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "range", "order", "or", "is", "gte", "lte", "ilike", "neq"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return builder;
      };
    }
    builder["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 });
    const client = {
      from: () => builder,
      rpc: (fn: string, args: unknown) => {
        calls.push({ method: "rpc", args: [fn, args] });
        return builder;
      },
    };
    const provider = createSupabaseProvider(client as never, { resources: { support_queue: { source: supportQueueSource() } } });
    await provider.getList("support_queue", {
      filters: [
        { field: "tenant_id", operator: "eq", value: "ta" },
        { field: "inbox_view", operator: "eq", value: "mine" },
        { field: "status", operator: "in", value: ["open"] },
      ],
    });
    expect(calls.find((c) => c.method === "rpc")?.args).toEqual(["support_agent_queue", { tenant: "ta", inbox_view: "mine" }]);
    expect(calls.filter((c) => c.method === "eq")).toEqual([]);
    expect(calls.filter((c) => c.method === "in").map((c) => c.args)).toEqual([["status", ["open"]]]);
    // A fixed tenant wins over the list's.
    expect(supportQueueSource({ tenant: "tb" }).args({ take: () => "ta" })).toEqual({ tenant: "tb", inbox_view: "ta" });
    expect(supportQueueSource().args({ take: () => undefined })).toEqual({ tenant: null, inbox_view: "all" });

    // Under a fixed tenant the list's tenant_id is still taken: it doesn't stay on as a column filter.
    calls.length = 0;
    const fixed = createSupabaseProvider(client as never, { resources: { support_queue: { source: supportQueueSource({ tenant: "tb" }) } } });
    await fixed.getList("support_queue", { filters: [{ field: "tenant_id", operator: "eq", value: "ta" }] });
    expect(calls.find((c) => c.method === "rpc")?.args).toEqual(["support_agent_queue", { tenant: "tb", inbox_view: "all" }]);
    expect(calls.filter((c) => c.method === "eq")).toEqual([]);
  });
});
