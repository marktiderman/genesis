// @feat:observability
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSettings, settingsCatalogue, settingsFromManifest } from "@marktiderman/genesis-config/settings";
import {
  OBSERVABILITY_SETTING_SPECS,
  observabilitySettings,
  observabilitySettingValues,
  parseSentryDsn,
  resolveSentryDsn,
  sentryDsnProblem,
} from "../../observability";

const DSN = "https://0123456789abcdef0123456789abcdef@o1.ingest.us.sentry.io/42";

describe("error reporting's settings", () => {
  it("package.json declares exactly what the code declares", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "package.json"), "utf8")) as { genesis: { settings: unknown[] } };
    const declared = pkg.genesis.settings.find((d) => (d as { namespace?: string }).namespace === "observability");
    expect(declared).toEqual({ namespace: "observability", keys: JSON.parse(JSON.stringify(OBSERVABILITY_SETTING_SPECS)) });
    expect(Object.keys(settingsFromManifest(declared).keys)).toEqual(Object.keys(observabilitySettings.keys));
  });

  it("is on, with no DSN or organization, by default", () => {
    const resolved = resolveSettings(settingsCatalogue([observabilitySettings]), { preset: "min" });
    expect(resolved.problems).toEqual([]);
    expect(observabilitySettingValues(resolved)).toEqual({ enabled: true, sentryDsn: null, sentryOrg: null });
    expect(observabilitySettingValues()).toEqual(observabilitySettingValues(resolved));
  });

  it("refuses a DSN or organization of the wrong shape in a layer, and the default applies", () => {
    const resolved = resolveSettings(settingsCatalogue([observabilitySettings]), {
      file: { "observability.sentryDsn": { value: "https://sentry.example.test/42" }, "observability.sentryOrg": { value: "Not A Slug" } },
    });
    expect(resolved.values["observability.sentryDsn"]).toBeNull();
    expect(resolved.values["observability.sentryOrg"]).toBeNull();
    expect(resolved.problems.map((p) => [p.key, p.message.includes("must match")]).sort()).toEqual([["observability.sentryDsn", true], ["observability.sentryOrg", true]]);
    const ok = resolveSettings(settingsCatalogue([observabilitySettings]), { database: { "observability.sentryDsn": { value: DSN }, "observability.sentryOrg": { value: "acme" } } });
    expect(observabilitySettingValues(ok)).toEqual({ enabled: true, sentryDsn: DSN, sentryOrg: "acme" });
  });

  it("parses a DSN, on sentry.io or self-hosted", () => {
    expect(parseSentryDsn(DSN)).toEqual({ publicKey: "0123456789abcdef0123456789abcdef", host: "o1.ingest.us.sentry.io", projectId: "42" });
    expect(parseSentryDsn("https://0123456789abcdef@sentry.example.test:9000/sub/7")).toEqual({ publicKey: "0123456789abcdef", host: "sentry.example.test:9000", projectId: "7" });
    expect(parseSentryDsn("nope")).toBeNull();
    // The shape fits, but no URL has that port.
    expect(parseSentryDsn("https://0123456789abcdef@sentry.example.test:99999/42")).toBeNull();
    expect(sentryDsnProblem("")).toBeNull();
    expect(sentryDsnProblem("nope")).toMatch(/isn't a Sentry DSN/);
  });

  it("takes the build's DSN, then the settings', and none while off", () => {
    expect(resolveSentryDsn({ build: DSN })).toEqual({ dsn: DSN, source: "build", enabled: true, problem: null });
    expect(resolveSentryDsn({ settings: { "observability.sentryDsn": DSN } })).toEqual({ dsn: DSN, source: "settings", enabled: true, problem: null });
    expect(resolveSentryDsn({ settings: { "observability.sentryDsn": DSN }, source: "cache" }).source).toBe("cache");
    expect(resolveSentryDsn({ build: DSN, settings: { "observability.enabled": false } })).toEqual({ dsn: null, source: null, enabled: false, problem: null });
    expect(resolveSentryDsn({})).toEqual({ dsn: null, source: null, enabled: true, problem: null });
  });

  it("uses the DSN in effect while still reporting a lower layer's refused one", () => {
    const resolved = resolveSettings(settingsCatalogue([observabilitySettings]), {
      file: { "observability.sentryDsn": { value: "https://sentry.example.test/42" } },
      database: { "observability.sentryDsn": { value: DSN } },
    });
    const r = resolveSentryDsn({ settings: resolved });
    expect(r.dsn).toBe(DSN);
    expect(r.source).toBe("settings");
    expect(r.problem).toMatch(/must match/);
  });
});

describe("the platform-neutral entry, /observability-settings", () => {
  const src = join(__dirname, "..", "..", "observability");

  it("exports the same settings as /observability, so a web app's catalogue can include them", async () => {
    const neutral = await import("../../observability/settings-entry");
    expect(neutral.observabilitySettings).toBe(observabilitySettings);
    expect(neutral.OBSERVABILITY_SETTING_SPECS).toBe(OBSERVABILITY_SETTING_SPECS);
    expect(Object.keys(settingsCatalogue([neutral.observabilitySettings]).keys)).toEqual(Object.keys(observabilitySettings.keys));
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "package.json"), "utf8")) as { exports: Record<string, Record<string, string>> };
    expect(pkg.exports["./observability-settings"]).toEqual({ types: "./dist/observability-settings.d.ts", import: "./dist/observability-settings.js", default: "./dist/observability-settings.js" });
  });

  it("imports no React, React Native or Expo, here or in what it imports", () => {
    const seen = new Set<string>();
    const bare: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(join(src, file), "utf8");
      for (const m of text.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
        const spec = m[1]!;
        if (spec.startsWith("./")) visit(`${spec.slice(2)}.ts`);
        else bare.push(spec);
      }
    };
    visit("settings-entry.ts");
    expect(seen.size).toBeGreaterThan(1);
    expect(bare.filter((s) => /^(?:react|react-native|expo)(?:[/-]|$)|^@expo\//.test(s))).toEqual([]);
  });
});
