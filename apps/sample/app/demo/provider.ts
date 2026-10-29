/**
 * The demo's data provider: Genesis's in-memory mock provider over the seed
 * rows, plus the two schema calls the Data Studio reads (`listResources`,
 * `describe`), answered from the same resource definitions the views use.
 * Nothing leaves the browser; Reset makes a fresh one.
 */
import { createMockProvider, type DataProvider } from "@marktiderman/genesis-core/provider";
import type { ResourceSchema, ResourceSummary } from "@marktiderman/genesis-core/schema";
import { seedBookings, seedClients } from "./seed";
import { bookingsResource } from "./views/bookings.view";
import { clientsResource } from "./views/clients.view";

const RESOURCES = [
  { resource: clientsResource, label: "Clients" },
  { resource: bookingsResource, label: "Bookings" },
];

/** A fresh in-memory store over the seed rows. */
export function createDemoProvider(): DataProvider {
  return createMockProvider({ clients: seedClients(), bookings: seedBookings() }, { delay: 120 });
}

/** The same store, as the Data Studio sees it: with the tables it lists, and what this role may do. */
export function studioProvider(base: DataProvider, canEdit: boolean, orgIds: readonly string[]): DataProvider {
  const access = canEdit
    ? { read: true, update: true, create: true, delete: true }
    : { read: true, update: false, create: false, delete: false, reason: "Your role can only read here." };
  return {
    ...base,
    // The studio reads only this workspace's rows, as row rules would make it in an app.
    getList: (resource, params) =>
      base.getList(resource, { ...params, filters: [...(params.filters ?? []), { field: "org_id", operator: "in", value: [...orgIds] }] }),
    async listResources(): Promise<ResourceSummary[]> {
      return RESOURCES.map((r) => ({ name: r.resource.name, label: r.label, access }));
    },
    async describe(name: string): Promise<ResourceSchema> {
      const found = RESOURCES.find((r) => r.resource.name === name);
      if (!found) throw new Error(`No resource called ${name}.`);
      return { ...found.resource, label: found.label, access } as unknown as ResourceSchema;
    },
  };
}
