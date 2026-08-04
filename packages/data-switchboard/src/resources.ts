// =====================================================================
// Worked example resources — tickets + features.
//
// These two resources PROVE mixed per-entity sources (Tier B): with the
// environment default = Airtable, `tickets` is BOUND to Supabase while
// `features` stays on Airtable — i.e. some resources come from Supabase
// and others from Airtable SIMULTANEOUSLY.
//
// The Airtable maps below are illustrative placeholders — canonical field
// NAMES → immutable Airtable field IDs (fldXXX). Renaming a column in the
// Airtable UI never breaks reads because we request returnFieldsByFieldId.
// Swap in your own base/table/field ids to use this against a real base.
// =====================================================================

import type { AirtableResourceMap } from "./adapters/airtable";
import type { ResourceContract } from "./types";

// ---------------------------------------------------------------------
// Airtable base + table ids (placeholders — swap in your own).
// ---------------------------------------------------------------------
export const AIRTABLE_BASE_ID = "appXXXXXXXXXXXXXX";

// ---------------------------------------------------------------------
// tickets — one ticket = one card = one unit of work.
// Identity is the Airtable record id (recXXX), surfaced as `id`.
// ---------------------------------------------------------------------
export interface TicketRow {
  id: string;
  title: string;
  feature: string;
  repo: string;
  prNumber: number;
  stage: string;
  delivery: string;
  status: string;
  who: string;
  parentId: string;
  agentHandle: string;
  [key: string]: unknown;
}

export const ticketsContract: ResourceContract<TicketRow> = {
  name: "tickets",
  key: "id",
  sourceOfTruth: "L2", // curated in Airtable today; promotable to L3.
  description: "A ticket (one card = one unit of work, e.g. one PR into a repo).",
  fields: [
    { name: "id", type: "string", description: "Airtable record id (recXXX)." },
    { name: "title", type: "string" },
    { name: "feature", type: "string", optional: true },
    { name: "repo", type: "string", optional: true },
    { name: "prNumber", type: "number", optional: true },
    { name: "stage", type: "string", optional: true },
    { name: "delivery", type: "string", optional: true },
    { name: "status", type: "string", optional: true },
    { name: "who", type: "string", optional: true },
    { name: "parentId", type: "string", optional: true },
    { name: "agentHandle", type: "string", optional: true },
  ],
};

export const ticketsAirtableMap: AirtableResourceMap = {
  table: "tblXXXXXXXXXXXXX1",
  idField: "id",
  fields: {
    title: "fldXXXXXXXXXXXXX1",
    feature: "fldXXXXXXXXXXXXX2",
    repo: "fldXXXXXXXXXXXXX3",
    prNumber: "fldXXXXXXXXXXXXX4",
    stage: "fldXXXXXXXXXXXXX5",
    delivery: "fldXXXXXXXXXXXXX6",
    status: "fldXXXXXXXXXXXXX7",
    who: "fldXXXXXXXXXXXXX8",
    parentId: "fldXXXXXXXXXXXXX9",
    agentHandle: "fldXXXXXXXXXXXXXA",
  },
};

export const ticketsSupabaseMap = {
  table: "tickets",
} as const;

// ---------------------------------------------------------------------
// features — the product-map feature node.
// ---------------------------------------------------------------------
export interface FeatureRow {
  id: string;
  name: string;
  level: string;
  status: string;
  jtbd: string;
  parent: string;
  [key: string]: unknown;
}

export const featuresContract: ResourceContract<FeatureRow> = {
  name: "features",
  key: "id",
  sourceOfTruth: "L2",
  description: "A product-map feature node (name, level, status, JTBD, parent).",
  fields: [
    { name: "id", type: "string", description: "Airtable record id (recXXX)." },
    { name: "name", type: "string" },
    { name: "level", type: "string", optional: true },
    { name: "status", type: "string", optional: true },
    { name: "jtbd", type: "string", optional: true },
    { name: "parent", type: "string", optional: true },
  ],
};

export const featuresAirtableMap: AirtableResourceMap = {
  table: "tblXXXXXXXXXXXXX2",
  idField: "id",
  fields: {
    name: "fldXXXXXXXXXXXXXB",
    level: "fldXXXXXXXXXXXXXC",
    status: "fldXXXXXXXXXXXXXD",
    jtbd: "fldXXXXXXXXXXXXXE",
    parent: "fldXXXXXXXXXXXXXF",
  },
};

export const featuresSupabaseMap = {
  table: "features",
} as const;
