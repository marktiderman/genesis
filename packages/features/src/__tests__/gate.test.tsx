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
  isSnapshotStale,
  requireFeature,
  type GateContext,
  type IdSet,
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

  it("reports the first no in the fixed order, with entitlement last", () => {
    const everything: GateContext = { platform: "native", off: ["webhooks"] };
    expect(featureOn(registry, everything, "webhooks").reason).toBe("platform");
    // Switched off and unpaid: no upsell, since paying wouldn't turn it on.
    expect(
      featureOn(registry, { ...everything, platform: "web" }, "webhooks")
        .reason,
    ).toBe("tenant");
    expect(
      featureOn(
        registry,
        { platform: "web", off: ["webhooks"], entitlements: ["webhooks"] },
        "webhooks",
      ).reason,
    ).toBe("tenant");
  });

  it("turns a flag on only when it is exactly true", () => {
    for (const value of ["true", 1, "false", 0, null as unknown as boolean]) {
      expect(
        featureOn(
          registry,
          { platform: "web", flags: { "sms.release": value } },
          "sms",
        ).reason,
      ).toBe("flag");
    }
  });

  it("reads each id set the same for every feature, and refuses iterators and strings", () => {
    const off = new Set(["library", "forms"]);
    const snapshot = gateSnapshot(registry, { platform: "web", off });
    expect([
      snapshot.answers.forms?.reason,
      snapshot.answers.library?.reason,
    ]).toEqual(["tenant", "tenant"]);
    expect(() =>
      featureOn(
        registry,
        { platform: "web", off: off.values() as unknown as IdSet },
        "forms",
      ),
    ).toThrow(TypeError);
    expect(() =>
      featureOn(
        registry,
        { platform: "web", off: "library" as unknown as IdSet },
        "forms",
      ),
    ).toThrow(/string/);
  });
});

describe("snapshots and requireFeature", () => {
  it("answers every shipped feature, without flag names, or the ones asked for", () => {
    const at = new Date("2026-10-26T12:00:00Z");
    const snapshot = gateSnapshot(
      registry,
      { platform: "web", off: ["library"] },
      { at, version: 7 },
    );
    expect(Object.keys(snapshot.answers)).toEqual([
      "forms",
      "webhooks",
      "library",
      "sms",
      "legacy",
    ]);
    expect(snapshot.answers.library?.reason).toBe("tenant");
    expect(snapshot.answers.sms).toEqual({ on: false, reason: "flag" });
    expect([snapshot.at, snapshot.version]).toEqual([
      "2026-10-26T12:00:00.000Z",
      7,
    ]);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(
      Object.keys(
        gateSnapshot(registry, web, { ids: ["forms", "courses"] }).answers,
      ),
    ).toEqual(["forms", "courses"]);
    expect(fromSnapshot(snapshot, "courses")).toEqual({
      on: false,
      reason: "unknown",
    });
    expect(
      isSnapshotStale(snapshot, 5 * 60_000, new Date("2026-10-26T12:04:00Z")),
    ).toBe(false);
    expect(
      isSnapshotStale(snapshot, 5 * 60_000, new Date("2026-10-26T12:06:00Z")),
    ).toBe(true);
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
