import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import type { Booking } from "../seed";

export const bookingsResource = defineResource<Booking>()({
  name: "bookings",
  key: "id",
  labelField: "title",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "org_id", type: "string" },
    { name: "client_id", type: "string", references: { resource: "clients", field: "id" } },
    { name: "title", type: "string" },
    { name: "starts_on", type: "datetime", dbType: "date" },
    { name: "status", type: "string", enumValues: ["booked", "done", "cancelled"], hasDefault: true },
  ],
});

export const bookingsView = defineView(bookingsResource, {
  scope: ["org_id"],
  fields: {
    status: { tones: { booked: "info", done: "success", cancelled: "muted" } },
    starts_on: { label: "Date" },
    client_id: { label: "Client", display: "relation", labelField: "name" },
  },
  columns: { default: ["title", "client_id", "starts_on", "status"], compact: ["title", "starts_on", "status"] },
  form: ["title", "client_id", "starts_on", "status"],
  orderBy: { field: "starts_on", direction: "desc" },
  can: {
    delete: (_row, viewer) => (viewer.roles?.demoRole === "client" ? "Cancel instead: set the status." : true),
  },
});
