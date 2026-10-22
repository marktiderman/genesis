import { defineFeatures, defineFlags, type FeatureIdOf } from "../index";

export const features = defineFeatures({
  tasks: {
    name: "Tasks",
    summary: "Coach and client both add and check off next steps.",
    status: "live",
    owner: "mark",
    apps: ["web"],
    audience: ["client", "coach"],
    visibility: "public",
    tagline: "Never lose a next step.",
    category: "Coaching",
    highlight: true,
    acceptance: ["A client can tick off a task their coach added."],
    reviewedAt: "2026-10-01",
    since: "2026-09",
    links: { code: ["src/tasks.ts"], docs: ["https://example.com/tasks"] },
  },
  wins: {
    name: "Wins",
    summary: "Every step forward, | recorded.",
    status: "beta",
    owner: "less",
    apps: ["web", "ios"],
    audience: ["client"],
    visibility: "public",
    tagline: "Celebrate progress.",
    category: "Coaching",
    acceptance: ["A win shows on the client's ledger."],
    reviewedAt: "2026-10-01",
  },
  billing: {
    name: "Billing",
    summary: "Practices pay for seats.",
    status: "planned",
    horizon: "next",
    owner: "mark",
    apps: ["admin"],
    audience: ["owner"],
    visibility: "internal",
    access: { plan: "pro" },
  },
});

export type FeatureId = FeatureIdOf<typeof features>;

export const flags = defineFlags(features, {
  "wins.v2": { feature: "wins", owner: "less", kind: "release", default: false, scopes: ["platform", "user"], expires: "2026-12-01" },
  "wins.kill": {
    feature: "wins",
    owner: "less",
    kind: "ops",
    default: true,
    scopes: ["platform"],
    runbook: "https://example.com/runbook",
    splitReason: "a kill switch outlives the rollout",
  },
});
