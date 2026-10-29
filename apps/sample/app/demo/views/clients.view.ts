import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import type { Client } from "../seed";

// What the data is. In an app, `genesis introspect` writes this from the database.
export const clientsResource = defineResource<Client>()({
  name: "clients",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "org_id", type: "string" },
    { name: "name", type: "string" },
    { name: "email", type: "string", widget: "email" },
    { name: "status", type: "string", enumValues: ["lead", "active", "paused", "ended"], hasDefault: true },
    { name: "plan", type: "string" },
    { name: "joined_on", type: "datetime", dbType: "date" },
    { name: "notes", type: "string", nullable: true, widget: "textarea" },
  ],
});

// What the screens show. `scope: ["org_id"]` makes every list follow the
// workspace switcher; the guards narrow what each role may do (the database's
// row rules are the real boundary in an app).
export const clientsView = defineView(clientsResource, {
  scope: ["org_id"],
  fields: {
    status: { tones: { active: "success", lead: "info", paused: "warning", ended: "muted" } },
    joined_on: { label: "Joined" },
  },
  columns: { default: ["name", "status", "plan", "email", "joined_on"], compact: ["name", "status"] },
  presets: { leads: { filter: { status: "lead" } } },
  form: ["name", "email", "status", "plan", "joined_on", "notes"],
  orderBy: { field: "name" },
  can: {
    create: (viewer) => (viewer.roles?.demoRole === "client" ? "Clients can't add other clients." : true),
    update: (_row, viewer) => (viewer.roles?.demoRole === "client" ? "Ask the studio to change your details." : true),
    delete: (_row, viewer) => (viewer.roles?.demoRole === "owner" ? true : "Only an owner removes a client."),
  },
});
