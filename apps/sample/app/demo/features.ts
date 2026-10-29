/**
 * The demo app's own features and flags, the way an app declares them: one
 * registry that running code reads. The gate decides what each organization
 * sees: an organization can switch a feature off, a paid one needs its plan,
 * and a release flag holds back a beta.
 */
import { defineFeatures, defineFlags } from "@marktiderman/genesis-features";
import { gateSnapshot, type GateContext } from "@marktiderman/genesis-features/gate";
import type { Org } from "./tenants";

const common = {
  owner: "demo",
  apps: ["web"],
  audience: ["staff"],
  visibility: "public",
  reviewedAt: "2026-10-29",
} as const;

export const demoFeatures = defineFeatures({
  "demo-intake": {
    ...common,
    name: "Intake form",
    summary: "A new client fills in a form and lands in the client list.",
    status: "live",
    access: "all",
    acceptance: ["A submitted intake form adds a client."],
  },
  "demo-data-studio": {
    ...common,
    name: "Data Studio",
    summary: "Edit the organization's tables like a spreadsheet.",
    status: "live",
    access: { plan: "pro" },
    acceptance: ["An owner edits a client's row in the studio."],
  },
  "demo-assistant": {
    ...common,
    name: "Assistant",
    summary: "Summarise a client with an AI task.",
    status: "beta",
    access: "all",
    acceptance: ["The assistant summarises a client."],
  },
});

export const demoFlags = defineFlags(demoFeatures, {
  "demo-assistant.release": { feature: "demo-assistant", kind: "release", owner: "demo", default: true, scopes: ["tenant"], expires: "2027-06-01" },
});

export type DemoFeatureId = keyof typeof demoFeatures;

/** What the gate says for one organization, with the visitor's own switches applied. */
export function demoGate(org: Org | undefined, overrides: { off: string[]; flags: Record<string, boolean> }) {
  const context: GateContext = {
    platform: "web",
    entitlements: org?.entitlements ?? ["demo-data-studio"],
    // An organization's own "off" list, less what the visitor turned back on (`on:<id>`), plus what they turned off.
    off: [...(org?.off ?? []).filter((id) => !overrides.flags[`on:${id}`]), ...overrides.off],
    flags: overrides.flags,
  };
  return gateSnapshot({ features: demoFeatures, flags: demoFlags }, context);
}
