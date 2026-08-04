// =====================================================================
// switchboard.config.sample.ts — a TEACHING ARTIFACT.
//
// One worked, heavily-commented composition that demonstrates EVERY
// Level × Tier combination the Switchboard can express, PLUS the Part-2
// multi-source READ-TIME MERGE. It is NOT imported by the app and NOT wired
// to apps/factory (live wiring is a separate cell) — copy from it.
//
//                 TIERS  (granularity of the backing choice)
//                 ───────────────────────────────────────────────────────
//                 A Environment       B Resource           C Field
//   L1 Code       env=prototype       testimonials ← code  scratch col ← code
//   L2 Airtable   env=curate          features ← airtable  curated col ← airtable
//   L3 Supabase   env=prod            tickets ← supa   identity+rows ← supa
//                 Resolution precedence:  C > B > A.
//   Tier B may also bind an ORDERED LIST of sources that MERGE at read time
//   (union → dedup by key → consolidate fields → LAST-source-wins on conflict).
//
// ── SECURITY (hard rules; see SWITCHBOARD.md + root CLAUDE.md) ─────────
//   • NO secrets live in this file. Credentials are INJECTED — the Airtable
//     API key and the Supabase client come from the caller (env / a built
//     supabase-js client). This sample reads them from `env` (see SampleEnv).
//   • Supabase access is RLS-gated on user_id = auth.uid() ONLY. org_id is
//     NEVER an access principal. Build the client with a MODERN publishable
//     key (sb_publishable_…) on the client, or a secret key (sb_secret_…)
//     server-side — legacy JWT anon/service_role keys are disabled.
//   • No hardcoded user/org UUIDs anywhere — identity flows from the session.
// =====================================================================

import { AirtableAdapter } from "./adapters/airtable";
import { CodeAdapter } from "./adapters/code";
import { SupabaseAdapter, type SupabaseClientLike } from "./adapters/supabase";
import { Registry } from "./registry";
import { Switchboard } from "./resolver";
import {
  AIRTABLE_BASE_ID,
  featuresAirtableMap,
  featuresContract,
  featuresSupabaseMap,
  ticketsAirtableMap,
  ticketsContract,
  ticketsSupabaseMap,
} from "./resources";
import type { ResourceContract } from "./types";

// ---------------------------------------------------------------------
// Injected configuration — the ONLY place credentials enter. Nothing here
// is a literal secret; the caller supplies these (e.g. from process.env on a
// server, or EXPO_PUBLIC_* + a built client in the app).
// ---------------------------------------------------------------------
export interface SampleEnv {
  /** Airtable API key (e.g. a personal-access token). NEVER commit a real one. */
  readonly airtableApiKey: string;
  /**
   * A pre-built supabase-js client. The APP owns auth/session and builds this
   * with a MODERN key (sb_publishable_ on the client / sb_secret_ server-side).
   * The adapter only needs `.from(table)` semantics — hence the structural type.
   */
  readonly supabaseClient: SupabaseClientLike;
}

// ---------------------------------------------------------------------
// A couple of throwaway resources so the sample can show Tier-C federation
// and a Tier-A code default without overloading the two real worked examples.
// ---------------------------------------------------------------------

/** A "widget" — used to demo a Tier-B → code override + Tier-C federation. */
interface WidgetRow extends Record<string, unknown> {
  id: string;
  label: string;
  /** A scratch/experimental column we want live-mocked in code (Tier C). */
  scratch: string;
}

export const widgetsContract: ResourceContract<WidgetRow> = {
  name: "widgets",
  key: "id",
  sourceOfTruth: "L3", // identity + durable rows live in Supabase…
  description: "Demo resource: Supabase identity + a code-mocked scratch column (Tier C).",
  fields: [
    { name: "id", type: "string", description: "Supabase row id." },
    { name: "label", type: "string" },
    { name: "scratch", type: "string", optional: true, description: "Live-mocked in code (Tier C)." },
  ],
};

/** A "testimonial" — used to demo a Tier-A environment default of CODE (L1). */
interface TestimonialRow extends Record<string, unknown> {
  id: string;
  quote: string;
}

export const testimonialsContract: ResourceContract<TestimonialRow> = {
  name: "testimonials",
  key: "id",
  sourceOfTruth: "L1",
  description: "Demo resource backed entirely by in-code fixtures (L1).",
  fields: [
    { name: "id", type: "string" },
    { name: "quote", type: "string" },
  ],
};

// =====================================================================
// (1) TIER A — ENVIRONMENT DEFAULT, demonstrated at EACH Level.
//     Tier A sets ONE default provider for ALL resources in an environment.
//     Three env presets show the default landing on each Level (L1/L2/L3).
// =====================================================================
export type SampleEnvName = "prototype" | "curate" | "prod";

/** Which provider is the Tier-A default for a given environment preset. */
const ENV_DEFAULT_PROVIDER = {
  prototype: "code", // Tier A @ L1 — everything mocked in code while exploring.
  curate: "airtable", // Tier A @ L2 — everything human-editable in Airtable.
  prod: "supabase", // Tier A @ L3 — everything durable in Postgres.
} as const;

// =====================================================================
// The full sample composition. Returns a ready Switchboard. Pick an env
// preset; the per-resource (Tier B/C) overrides + the merge are layered on top.
// =====================================================================
export function buildSampleSwitchboard(env: SampleEnv, envName: SampleEnvName = "curate"): Switchboard {
  // -- adapters: one instance per provider kind. Creds are INJECTED. --------
  const codeAdapter = new CodeAdapter({
    fixtures: {
      // L1 fixtures for the code-backed resources (and a scratch source for C).
      testimonials: [
        { id: "t1", quote: "Continuity changed our care." },
        { id: "t2", quote: "The brief writes itself now." },
      ],
      widgets: [
        // Under Tier C, only `scratch` is read from here; identity comes from L3.
        { id: "w1", label: "(ignored — base supplies label)", scratch: "experimental-A" },
        { id: "w2", label: "(ignored)", scratch: "experimental-B" },
      ],
    },
  });

  const airtableAdapter = new AirtableAdapter({
    apiKey: env.airtableApiKey, // ← injected; never a literal.
    baseId: AIRTABLE_BASE_ID,
    maps: {
      features: featuresAirtableMap,
      tickets: ticketsAirtableMap,
    },
    // ttl/retry left at safe defaults (rename-proof field-ID reads, capped 429
    // retry, stale-while-error all on). See adapters/airtable.ts.
  });

  const supabaseAdapter = new SupabaseAdapter({
    client: env.supabaseClient, // ← injected, built with a MODERN key by the app.
    maps: {
      tickets: ticketsSupabaseMap,
      features: featuresSupabaseMap,
      widgets: { table: "widgets" },
    },
  });

  const registry = new Registry()
    // -- register every resource's provider-agnostic contract -------------
    .register(ticketsContract)
    .register(featuresContract)
    .register(widgetsContract)
    .register(testimonialsContract)
    // -- wire the concrete adapters (one per Level) -----------------------
    .useAdapter(codeAdapter) // L1
    .useAdapter(airtableAdapter) // L2
    .useAdapter(supabaseAdapter) // L3

    // =================================================================
    // TIER A — the environment default (lands on L1, L2, or L3 per preset).
    // =================================================================
    .setEnvironmentDefault(ENV_DEFAULT_PROVIDER[envName])

    // =================================================================
    // TIER B — per-resource overrides, ONE shown at EACH Level.
    // =================================================================
    // Tier B @ L1 (code): testimonials always come from in-code fixtures,
    // regardless of the env default.
    .bindResource("testimonials", "code")
    // Tier B @ L2 (airtable): features stay human-editable in Airtable.
    .bindResource("features", "airtable")
    // Tier B @ L3 (supabase): tickets is durable in Postgres.
    // (NOTE: this single-provider bind is REPLACED below by the Part-2 MERGE
    //  bind for tickets — shown here so the per-Level Tier-B example is
    //  explicit; the later bindMerge() wins, last-bind-wins.)
    .bindResource("tickets", "supabase")

    // =================================================================
    // TIER C — FIELD FEDERATION (precedence C > B > A). `widgets` row identity
    // + label come from Supabase (L3); the `scratch` column is live-mocked in
    // code (L1), joined by the resource `key`.
    // =================================================================
    .bindFields("widgets", "supabase", { scratch: "code" })

    // =================================================================
    // PART 2 — MULTI-SOURCE READ-TIME MERGE (a Tier-B variant).
    // tickets now reads from BOTH Airtable AND Supabase and MERGES:
    //   union → dedup by `id` → consolidate fields → LAST source wins on a
    //   field conflict. Order ["airtable","supabase"] ⇒ Supabase wins conflicts
    //   (the durable record is authoritative); Airtable contributes any field
    //   Supabase lacks (e.g. a curator-only column).
    // Writes route to the LAST source (Supabase) by default — a merge is
    // READ-TIME only, never a write-to-all. Pass a 3rd arg to bindMerge() to
    // redirect writes (e.g. keep curation writes flowing to Airtable).
    // =================================================================
    .bindMerge("tickets", ["airtable", "supabase"]);

  return new Switchboard(registry);
}

// ---------------------------------------------------------------------
// USAGE (pseudo — do NOT run this file; it's a teaching artifact):
//
//   import { createClient } from "@supabase/supabase-js";
//   const supabaseClient = createClient(
//     process.env.SUPABASE_URL!,
//     process.env.SUPABASE_PUBLISHABLE_KEY!, // sb_publishable_… (modern key)
//   );
//   const data = buildSampleSwitchboard(
//     { airtableApiKey: process.env.AIRTABLE_API_KEY!, supabaseClient },
//     "prod",
//   );
//
//   // Reads are Level-agnostic; the app never knows where rows live:
//   await data.resource("testimonials").list(); // L1 code        (Tier B)
//   await data.resource("features").list();     // L2 Airtable    (Tier B)
//   await data.resource("widgets").list();       // L3 + code field (Tier C)
//   await data.resource("tickets").list();   // Airtable⊕Supabase MERGE
//   // ↑ merged: union of both backings, deduped by id, fields consolidated,
//   //   Supabase winning any field both sources set.
// ---------------------------------------------------------------------
