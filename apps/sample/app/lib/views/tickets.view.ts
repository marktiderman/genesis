import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import type { Ticket } from "../data";

export const ticketsResource = defineResource<Ticket>()({
  name: "tickets",
  key: "id",
  labelField: "subject",
  fields: [
    { name: "id", type: "string" },
    { name: "subject", type: "string" },
    { name: "body", type: "string", control: "textarea" },
    { name: "requester", type: "string" },
    { name: "status", type: "string", enumValues: ["open", "waiting", "solved"] },
    { name: "unread", type: "boolean" },
    { name: "updated_at", type: "datetime" },
  ],
});

// One view, two view types: a table and an inbox. The inbox block says which field is which; the
// segments are its rail, with their counts; "solve" runs on many tickets and on the e key.
export const ticketsView = defineView(ticketsResource, {
  fields: { status: { tones: { open: "info", waiting: "warning", solved: "success" } } },
  columns: { default: ["subject", "requester", "status", "updated_at"] },
  segments: [
    { id: "open", label: "Open", where: { status: "open" }, count: true },
    { id: "waiting", label: "Waiting", where: { status: "waiting" }, count: true },
    { id: "solved", label: "Solved", where: { status: "solved" }, count: true },
    { id: "all", label: "All", count: true },
  ],
  actions: [{ name: "done", label: "Solve", bulk: true, can: (t) => (t.status === "solved" ? "It's solved already." : true) }],
  inbox: { preview: "body", time: "updated_at", from: "requester", unread: "unread", badge: "status" },
  types: ["inbox", "table"],
  orderBy: { field: "updated_at", direction: "desc" },
});
