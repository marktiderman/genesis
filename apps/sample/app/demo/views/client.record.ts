import { defineRecordView } from "@marktiderman/genesis-core/resource-view";
import { bookingsView } from "./bookings.view";
import { clientsView } from "./clients.view";

// One client's page, from the same view: a header, a tab per section, the
// bookings list filtered to them, and their details edited in place.
export const clientRecordView = defineRecordView(clientsView, {
  sections: [
    { id: "bookings", label: "Bookings", list: { view: bookingsView, filter: (c) => ({ client_id: c.id }) } },
    { id: "details", label: "Details", settings: ["name", "email", "status", "plan", "notes"] },
    { id: "activity", label: "Activity" },
  ],
  readiness: (c) => [
    { title: "Has an email", ok: !!c.email, reason: "Add an email address." },
    { title: "Has a plan", ok: !!c.plan, reason: "Pick a plan." },
  ],
});
