// @feat:support-helpdesk
import { describe, expect, it } from "vitest";
import { createSupportClient, requesterTenantsLabel } from "../client";
import { fakeSupabase } from "./fake-supabase";

describe("the client's staff tools", () => {
  const rows: Record<string, unknown> = {
    support_agents_list: [{ user_id: "u1", full_name: "Ana" }, { user_id: "u2", full_name: null }],
    support_reporters: [{ user_id: "u3", full_name: "Bo", email: "bo@example.test" }],
    support_requester_tenants: [{ tenant_id: "t1", label: "Acme" }, { tenant_id: "t2", label: null }],
  };
  const make = () => {
    const fake = fakeSupabase({ rpc: (fn) => ({ data: rows[fn] ?? null, error: null }) });
    return { fake, client: createSupportClient(fake.client) };
  };

  it("lists a tenant's agents, the app's own by default", async () => {
    const { fake, client } = make();
    expect(await client.staffList!()).toEqual([{ id: "u1", name: "Ana" }, { id: "u2", name: null }]);
    await client.staffList!({ tenantId: "t1" });
    expect(fake.rpcs.map((r) => r.args)).toEqual([{ tenant: null }, { tenant: "t1" }]);
  });

  it("names who wrote, asking once per id and not at all for none", async () => {
    const { fake, client } = make();
    expect(await client.reporters!([])).toEqual([]);
    expect(await client.reporters!(["u3", "u3"])).toEqual([{ id: "u3", name: "Bo", email: "bo@example.test" }]);
    expect(fake.rpcs).toEqual([{ fn: "support_reporters", args: { ids: ["u3"] } }]);
  });

  it("gives a requester's tenants, and one line of their labels", async () => {
    const { client } = make();
    const tenants = await client.requesterTenants!("u3");
    expect(tenants).toEqual([{ tenantId: "t1", label: "Acme" }, { tenantId: "t2", label: null }]);
    expect(requesterTenantsLabel(tenants)).toBe("Acme");
    expect(requesterTenantsLabel([])).toBeNull();
  });

  it("sets an idea's status and feature", async () => {
    const { fake, client } = make();
    await client.setIdeaStatus!("i1", "shipped", "support-feedback");
    expect(fake.rpcs).toEqual([{ fn: "support_set_idea_status", args: { idea: "i1", status: "shipped", feature: "support-feedback" } }]);
  });
});
