// The fixture app's feature registry, so the self-test runs `genesis features check`.
import { defineFeatures } from "@marktiderman/genesis-features";

export const features = defineFeatures({
  "fixture-home": {
    name: "Fixture home",
    summary: "The one screen of the CI fixture app.",
    status: "building",
    owner: "ci",
    apps: ["web"],
    audience: ["developer"],
    reviewedAt: "2026-10-24",
    acceptance: ["The app CI self-test runs typecheck, lint, test, the doctor and this check green."],
  },
});
