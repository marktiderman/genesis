import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import type { Item } from "../data";

// What the data is. In an app, `genesis introspect` writes this from the database.
export const itemsResource = defineResource<Item>()({
  name: "items",
  key: "id",
  labelField: "name",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "name", type: "string" },
    { name: "status", type: "string", enumValues: ["Active", "Draft", "Archived"] },
    { name: "category", type: "string" },
    { name: "price", type: "string" },
    { name: "created", type: "datetime", dbType: "date" },
  ],
});

// What the screen shows: one description for the list, the form and the phone.
export const itemsView = defineView(itemsResource, {
  fields: { status: { tones: { Active: "success", Draft: "warning", Archived: "muted" } } },
  columns: { default: ["name", "status", "category", "price", "created"] },
  form: ["name", "status", "category", "price"],
  orderBy: { field: "created", direction: "desc" },
});
