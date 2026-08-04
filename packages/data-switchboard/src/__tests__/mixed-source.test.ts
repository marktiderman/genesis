// =====================================================================
// THE OWNER'S EXPLICIT ASK — mixed per-entity sources (Tier B).
//
// Environment default = Airtable. `tickets` is BOUND to Supabase (Tier B)
// while `features` STAYS on Airtable. The same Switchboard instance therefore
// serves some resources from Supabase and others from Airtable SIMULTANEOUSLY,
// and the app never knows the Level — it just calls data.resource('x').list().
// =====================================================================

import { describe, expect, it } from "vitest";
import {
  AirtableAdapter,
  Registry,
  SupabaseAdapter,
  Switchboard,
  featuresAirtableMap,
  featuresContract,
  ticketsAirtableMap,
  ticketsContract,
  ticketsSupabaseMap,
} from "../index";
import { makeAirtableFetch } from "./helpers/airtable-fetch";
import { FakeSupabaseClient } from "./helpers/fake-supabase";

describe("Tier B — mixed per-entity sources (Airtable + Supabase at once)", () => {
  it("serves tickets from Supabase and features from Airtable in one client", async () => {
    // -- L3 Supabase (tickets lives here) --
    const supabase = new FakeSupabaseClient({
      tickets: [
        {
          id: "rec_db_1",
          title: "Switchboard framework",
          feature: "data-layer",
          repo: "acme-app",
          prNumber: 1667,
          stage: "build",
          delivery: "in_progress",
          status: "open",
          who: "agent-relay",
          parentId: "",
          agentHandle: "relay",
        },
      ],
    });
    const supabaseAdapter = new SupabaseAdapter({
      client: supabase,
      maps: { tickets: ticketsSupabaseMap },
    });

    // -- L2 Airtable (features stays here) --
    const airtableAdapter = new AirtableAdapter({
      apiKey: "key-test",
      baseId: "appXXXXXXXXXXXXXX",
      maps: { features: featuresAirtableMap },
      ttlMs: 0,
      fetch: makeAirtableFetch({
        [featuresAirtableMap.table]: [
          {
            id: "rec_feat_1",
            fields: {
              [featuresAirtableMap.fields.name!]: "Reconciliation",
              [featuresAirtableMap.fields.level!]: "L2",
              [featuresAirtableMap.fields.status!]: "shipping",
              [featuresAirtableMap.fields.jtbd!]: "Never silently drift",
              [featuresAirtableMap.fields.parent!]: "rec_root",
            },
          },
        ],
      }),
    });

    // -- Registry: env default = Airtable; tickets overridden to Supabase --
    const registry = new Registry()
      .register(ticketsContract)
      .register(featuresContract)
      .useAdapter(airtableAdapter)
      .useAdapter(supabaseAdapter)
      .setEnvironmentDefault("airtable") // Tier A — everything defaults to Airtable…
      .bindResource("tickets", "supabase"); // …except tickets (Tier B).

    const data = new Switchboard(registry);

    // tickets resolves to Supabase (Tier B override).
    expect(data.resource("tickets").plan()).toMatchObject({
      base: "supabase",
      baseTier: "B",
    });
    // features resolves to Airtable (Tier A default).
    expect(data.resource("features").plan()).toMatchObject({
      base: "airtable",
      baseTier: "A",
    });

    // The PROOF: both reads succeed from DIFFERENT backends, same client.
    const cycles = await data.resource("tickets").list();
    const features = await data.resource("features").list();

    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({
      id: "rec_db_1",
      title: "Switchboard framework",
      prNumber: 1667,
    });

    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      id: "rec_feat_1",
      name: "Reconciliation",
      level: "L2",
      jtbd: "Never silently drift",
    });
  });

  it("writes route to each resource's own backing provider", async () => {
    const supabase = new FakeSupabaseClient({ tickets: [] });
    const supabaseAdapter = new SupabaseAdapter({
      client: supabase,
      maps: { tickets: ticketsSupabaseMap },
    });
    const airtableAdapter = new AirtableAdapter({
      apiKey: "key-test",
      baseId: "appXXXXXXXXXXXXXX",
      maps: { features: featuresAirtableMap, tickets: ticketsAirtableMap },
      ttlMs: 0,
      fetch: makeAirtableFetch({
        [featuresAirtableMap.table]: [],
        [ticketsAirtableMap.table]: [],
      }),
    });

    const registry = new Registry()
      .register(ticketsContract)
      .register(featuresContract)
      .useAdapter(airtableAdapter)
      .useAdapter(supabaseAdapter)
      .setEnvironmentDefault("airtable")
      .bindResource("tickets", "supabase");

    const data = new Switchboard(registry);

    const created = await data.resource("tickets").create({
      id: "",
      title: "New cycle",
      feature: "x",
      repo: "r",
      prNumber: 1,
      stage: "s",
      delivery: "d",
      status: "open",
      who: "w",
      parentId: "",
      agentHandle: "h",
    });
    expect(created.title).toBe("New cycle");

    // It landed in Supabase (the bound provider), NOT Airtable.
    const fromDb = await data.resource("tickets").list();
    expect(fromDb).toHaveLength(1);
    expect(fromDb[0]).toMatchObject({ title: "New cycle" });
  });
});
