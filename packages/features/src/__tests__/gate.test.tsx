/** @feat:feature-gate */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FeatureOff,
  defineFeatures,
  defineFlags,
  featureOn,
  fromSnapshot,
  gateSnapshot,
  requireFeature,
  type GateContext,
} from "../index";
import { FeatureGate, FeatureGateProvider, useFeature } from "../gate-react";

const base = {
  owner: "mark",
  audience: ["coach"],
  summary: "Does x.",
  acceptance: ["It works."],
  reviewedAt: "2026-10-26",
} as const;
const features = defineFeatures({
  forms: {
    ...base,
    name: "Forms",
    status: "live",
    apps: ["web", "ios"],
    platforms: { web: "live", native: "beta", server: "live" },
  },
  webhooks: {
    ...base,
    name: "Webhooks",
    status: "live",
    apps: ["web"],
    platforms: { web: "live", server: "live" },
    access: { plan: "pro" },
  },
  library: {
    ...base,
    name: "Library",
    status: "live",
    apps: ["web"],
    platforms: { web: "live", native: "live" },
  },
  sms: {
    ...base,
    name: "Text a link",
    status: "beta",
    apps: ["web"],
    platforms: { web: "beta" },
  },
  courses: {
    ...base,
    name: "Courses",
    status: "planned",
    horizon: "next",
    apps: ["web"],
  },
  legacy: { ...base, name: "Old export", status: "deprecated", apps: ["web"] },
  gone: { ...base, name: "Gone", status: "retired", apps: ["web"] },
});
const flags = defineFlags(features, {
  "sms.release": {
    feature: "sms",
    kind: "release",
    owner: "mark",
    default: false,
    scopes: ["platform", "tenant"],
    expires: "2027-01-31",
  },
  "forms.layout": {
    feature: "forms",
    kind: "experiment",
    owner: "mark",
    default: false,
    scopes: ["platform"],
    expires: "2027-01-31",
  },
});
const registry = { features, flags };
const web: GateContext = { platform: "web" };

describe("featureOn", () => {
  it("is on when every check passes", () => {
    expect(featureOn(registry, web, "forms")).toEqual({ on: true });
    expect(featureOn(registry, web, "legacy")).toEqual({ on: true });
  });

  it("refuses unknown ids and unshipped or retired features by status", () => {
    expect(featureOn(registry, web, "nope")).toEqual({
      on: false,
      reason: "unknown",
    });
    expect(featureOn(registry, web, "toString")).toEqual({
      on: false,
      reason: "unknown",
    });
    expect(featureOn(registry, web, "courses")).toEqual({
      on: false,
      reason: "status",
    });
    expect(featureOn(registry, web, "gone")).toEqual({
      on: false,
      reason: "status",
    });
  });

  it("refuses a platform the feature hasn't shipped on", () => {
    expect(featureOn(registry, { platform: "native" }, "webhooks").reason).toBe(
      "platform",
    );
    expect(featureOn(registry, { platform: "native" }, "forms")).toEqual({
      on: true,
    });
  });

  it("refuses a paid feature without an entitlement, with the plan that unlocks it", () => {
    expect(featureOn(registry, web, "webhooks")).toEqual({
      on: false,
      reason: "entitlement",
      unlock: { plan: "pro" },
    });
    expect(
      featureOn(
        registry,
        { platform: "web", entitlements: ["webhooks"] },
        "webhooks",
      ),
    ).toEqual({ on: true });
    expect(
      featureOn(
        registry,
        { platform: "web", entitlements: (id) => id === "webhooks" },
        "webhooks",
      ).on,
    ).toBe(true);
  });

  it("refuses what the tenant switched off", () => {
    expect(
      featureOn(
        registry,
        { platform: "web", off: new Set(["library"]) },
        "library",
      ),
    ).toEqual({ on: false, reason: "tenant" });
  });

  it("refuses when a release flag is off, and ignores experiments", () => {
    expect(featureOn(registry, web, "sms")).toEqual({
      on: false,
      reason: "flag",
      flag: "sms.release",
    });
    expect(
      featureOn(
        registry,
        { platform: "web", flags: { "sms.release": true } },
        "sms",
      ),
    ).toEqual({ on: true });
    expect(
      featureOn(registry, { platform: "web", flags: () => true }, "sms").on,
    ).toBe(true);
    expect(
      featureOn(
        registry,
        { platform: "web", flags: { "forms.layout": false } },
        "forms",
      ).on,
    ).toBe(true);
  });

  it("reports the first no in the fixed order", () => {
    // Paid, switched off and on the wrong platform: platform comes first, then entitlement.
    const everything: GateContext = { platform: "native", off: ["webhooks"] };
    expect(featureOn(registry, everything, "webhooks").reason).toBe("platform");
    expect(
      featureOn(registry, { ...everything, platform: "web" }, "webhooks")
        .reason,
    ).toBe("entitlement");
    expect(
      featureOn(
        registry,
        { platform: "web", off: ["webhooks"], entitlements: ["webhooks"] },
        "webhooks",
      ).reason,
    ).toBe("tenant");
  });
});

describe("snapshots and requireFeature", () => {
  it("answers every feature, or the ones asked for", () => {
    const snapshot = gateSnapshot(registry, {
      platform: "web",
      off: ["library"],
    });
    expect(Object.keys(snapshot)).toEqual(Object.keys(features));
    expect(snapshot.library?.reason).toBe("tenant");
    expect(Object.keys(gateSnapshot(registry, web, ["forms"]))).toEqual([
      "forms",
    ]);
    expect(fromSnapshot(snapshot, "missing")).toEqual({
      on: false,
      reason: "unknown",
    });
  });

  it("throws FeatureOff with the reason and an HTTP status", () => {
    expect(() => requireFeature(registry, web, "forms")).not.toThrow();
    try {
      requireFeature(registry, web, "webhooks");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FeatureOff);
      const off = error as FeatureOff;
      expect([off.feature, off.reason, off.unlock?.plan, off.status]).toEqual([
        "webhooks",
        "entitlement",
        "pro",
        402,
      ]);
      expect(off.message).toBe("webhooks needs the pro plan");
    }
    try {
      requireFeature(
        registry,
        { platform: "web", off: ["library"] },
        "library",
      );
    } catch (error) {
      expect((error as FeatureOff).status).toBe(403);
    }
  });
});

describe("React", () => {
  const snapshot = gateSnapshot(registry, {
    platform: "web",
    off: ["library"],
  });
  function Probe({ id }: { id: string }) {
    const answer = useFeature(id);
    return <span>{`${id}:${answer.on ? "on" : answer.reason}`}</span>;
  }

  it("reads answers from the provider", () => {
    render(
      <FeatureGateProvider snapshot={snapshot}>
        <Probe id="forms" />
        <Probe id="library" />
      </FeatureGateProvider>,
    );
    expect(screen.getByText("forms:on")).toBeTruthy();
    expect(screen.getByText("library:tenant")).toBeTruthy();
  });

  it("FeatureGate shows children, an upsell or the fallback", () => {
    render(
      <FeatureGateProvider snapshot={snapshot}>
        <p>
          <FeatureGate feature="forms">Forms page</FeatureGate>
        </p>
        <p>
          <FeatureGate
            feature="webhooks"
            upsell={({ unlock }) => `Upgrade to ${unlock.plan}`}
          >
            Webhooks
          </FeatureGate>
        </p>
        <p>
          <FeatureGate feature="library" fallback="Library is turned off">
            Library
          </FeatureGate>
        </p>
      </FeatureGateProvider>,
    );
    expect(screen.getByText("Forms page")).toBeTruthy();
    expect(screen.getByText("Upgrade to pro")).toBeTruthy();
    expect(screen.getByText("Library is turned off")).toBeTruthy();
    expect(screen.queryByText("Webhooks")).toBeNull();
  });

  it("refuses to guess without a provider", () => {
    expect(() => render(<Probe id="forms" />)).toThrow(/FeatureGateProvider/);
  });
});
