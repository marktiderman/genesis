import { defineFeatures, defineFlags, type FeatureIdOf } from "../index";

export const features = defineFeatures({
  tasks: {
    name: "Tasks",
    summary: "Coach and client both add and check off next steps.",
    status: "live",
    owner: "mark",
    apps: ["web"],
    audience: ["client", "coach"],
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
  },
  billing: {
    name: "Billing",
    summary: "Practices pay for seats.",
    status: "planned",
    owner: "mark",
    apps: ["admin"],
    audience: ["owner"],
  },
});

export type FeatureId = FeatureIdOf<typeof features>;

export const flags = defineFlags(features, {
  wins_v2: { feature: "wins", owner: "less", kind: "release", expires: "2026-12-01" },
  wins_kill: { feature: "wins", owner: "less", kind: "ops", splitReason: "a kill switch outlives the rollout" },
});
