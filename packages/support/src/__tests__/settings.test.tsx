// @feat:support-feedback
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { resolveSettings, settingsCatalogue, settingsFromManifest, settingsSecrets } from "@marktiderman/genesis-config/settings";
import {
  DIAGNOSTICS_SETTING_SPECS,
  SHAKE_SETTING_SPECS,
  SUPPORT_SETTING_SPECS,
  SUPPORT_SETTINGS_DECLARATIONS,
  createDiagnostics,
  resolveSupportSettings,
  supportContributions,
  supportSettingValues,
  supportSettingsCatalogue,
  type DiagnosticsTransport,
} from "../index";
import { createSupport, type AccelerometerLike } from "../native";
import { FeedbackPanel } from "../web";
import { fakeSupabase } from "./fake-supabase";

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as { genesis: { settings: unknown[] } };

describe("support's settings", () => {
  it("package.json declares exactly what the code declares, so the doctor reads the same keys", () => {
    expect(pkg.genesis.settings).toEqual([
      { namespace: "support", keys: JSON.parse(JSON.stringify(SUPPORT_SETTING_SPECS)) },
      { namespace: "diagnostics", keys: JSON.parse(JSON.stringify(DIAGNOSTICS_SETTING_SPECS)) },
      { namespace: "shake", keys: JSON.parse(JSON.stringify(SHAKE_SETTING_SPECS)) },
    ]);
    const fromManifest = settingsCatalogue(pkg.genesis.settings.map((raw) => settingsFromManifest(raw)));
    expect(Object.keys(fromManifest.keys).sort()).toEqual(Object.keys(supportSettingsCatalogue().keys).sort());
  });

  it("zero config is the max preset: every feature on, and nothing it requires is off", () => {
    const resolved = resolveSupportSettings();
    expect(resolved.preset).toBe("max");
    expect(resolved.problems).toEqual([]);
    const s = supportSettingValues(resolved);
    for (const key of ["feedback", "inbox", "messenger", "agentDesk", "helpCenter", "aiAnswers", "ideas", "chatThreads", "email", "replyByEmail", "desks", "staffAlerts"] as const) {
      expect(s.support[key], key).toBe(true);
    }
    expect(s.diagnostics).toMatchObject({ enabled: true, dumpOnShake: true, dumpOnFeedback: true, maxBytes: 262_144, perHour: 10, retentionDays: 90 });
    expect(s.shake).toEqual({ enabled: true, threshold: 2.3, jolts: 2, windowMs: 1000, cooldownMs: 3000 });
    expect(supportSettingValues()).toEqual(s);
  });

  it("standard leaves out AI answers, email and desks; min is the feedback form and the dump", () => {
    const standard = supportSettingValues(resolveSupportSettings({ preset: "standard" }));
    expect(standard.support).toMatchObject({ aiAnswers: false, email: false, replyByEmail: false, desks: false, messenger: true, agentDesk: true, inbox: true, ideas: true });
    const min = supportSettingValues(resolveSupportSettings({ preset: "min" }));
    expect(min.support).toMatchObject({ feedback: true, inbox: false, messenger: false, agentDesk: false, helpCenter: false, ideas: false, chatThreads: false, staffAlerts: false });
    expect(min.diagnostics.enabled).toBe(true);
    for (const preset of ["standard", "min"] as const) expect(resolveSupportSettings({ preset }).problems).toEqual([]);
  });

  it("shake to report is each person's to turn off; a tenant can't", () => {
    const resolved = resolveSupportSettings({ tenant: { "shake.enabled": { value: false } }, person: { "shake.enabled": { value: false } } });
    expect(resolved.sources["shake.enabled"]).toEqual({ layer: "person" });
    expect(resolved.problems.map((p) => p.kind)).toEqual(["scope"]);
    expect(supportSettingValues(resolved).shake.enabled).toBe(false);
  });

  it("names its secrets and their stores, never their values", () => {
    expect(settingsSecrets(supportSettingsCatalogue())).toEqual(
      expect.arrayContaining([
        { key: "support.githubRepo", name: "GITHUB_TOKEN", store: "edge" },
        { key: "support.email", name: "RESEND_API_KEY", store: "edge" },
        { key: "support.aiAnswers", name: "ANTHROPIC_API_KEY", store: "edge" },
      ]),
    );
  });

  it("reads a whole app's resolved settings, the values alone, or a partial map, and skips values that don't fit", () => {
    const app = resolveSettings(settingsCatalogue(SUPPORT_SETTINGS_DECLARATIONS), { file: { "support.ideas": { value: false } } });
    expect(supportSettingValues(app).support.ideas).toBe(false);
    expect(supportSettingValues(app.values).support.ideas).toBe(false);
    expect(supportSettingValues({ "diagnostics.perHour": 2.5 }).diagnostics.perHour).toBe(10);
    expect(resolveSupportSettings({ file: { "diagnostics.perHour": { value: 4 } }, database: { "diagnostics.perHour": { value: 2.5 } } }).values["diagnostics.perHour"]).toBe(4);
    const partial = supportSettingValues({ "diagnostics.maxBytes": 70_000, "shake.jolts": "three", "support.githubIssueDetail": "everything" });
    expect(partial.diagnostics.maxBytes).toBe(70_000);
    expect(partial.shake.jolts).toBe(2);
    expect(partial.support.githubIssueDetail).toBe("summary");
  });
});

describe("createDiagnostics with settings", () => {
  const transport = (): DiagnosticsTransport & { sent: unknown[] } => {
    const sent: unknown[] = [];
    return { name: "memory", sent, send: async (report) => (sent.push(report), { id: report.id, shortId: "ABCD1234" }), feedbackSink: { submit: async () => ({ id: "r1", attachments: [] }) as never } };
  };

  it("sends nothing with diagnostics off, and still sends the feedback", async () => {
    const t = transport();
    const d = createDiagnostics({ app: { id: "acme" }, transport: t, appSettings: { "diagnostics.enabled": false } });
    expect(d.enabled).toBe(false);
    await expect(d.send({ trigger: "manual" })).rejects.toMatchObject({ code: "disabled", retryable: false });
    const delivery = await d.submitFeedback({ type: "bug", message: "broken", context: {} } as never);
    expect(delivery).toMatchObject({ id: "r1", diagnostics: null });
    expect(t.sent).toEqual([]);
  });

  it("drops what an earlier run queued when diagnostics are off", async () => {
    const storage = { getItem: vi.fn(() => "[]"), setItem: vi.fn(), removeItem: vi.fn() };
    createDiagnostics({ app: { id: "acme" }, transport: transport(), offline: { storage }, appSettings: { "diagnostics.enabled": false } });
    await new Promise((r) => setTimeout(r, 0));
    expect(storage.removeItem).toHaveBeenCalledWith(expect.any(String));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("caps a dump at diagnostics.maxBytes unless limits say otherwise", async () => {
    const big = "x".repeat(4000);
    const sections = [{ name: "game", options: { maxBytes: 200_000 }, collect: () => Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, big])) }];
    const small = createDiagnostics({ app: { id: "acme" }, transport: transport(), sections: sections as never, appSettings: { "diagnostics.maxBytes": 65_536 } });
    const report = await small.collect();
    expect(JSON.stringify(report).length).toBeLessThanOrEqual(65_536);
    const wins = createDiagnostics({ app: { id: "acme" }, transport: transport(), sections: sections as never, appSettings: { "diagnostics.maxBytes": 65_536 }, limits: { maxBytes: 262_144 } });
    expect(JSON.stringify(await wins.collect()).length).toBeGreaterThan(65_536);
  });
});

function accelerometer() {
  let listener: ((m: { x: number; y: number; z: number }) => void) | null = null;
  const fake: AccelerometerLike & { jolt: (g: number) => void } = {
    addListener: (l) => {
      listener = l;
      return { remove: () => undefined };
    },
    jolt: (g) => listener?.({ x: g, y: 0, z: 0 }),
  };
  return fake;
}

describe("createSupport with settings", () => {
  const make = (appSettings: Parameters<typeof createSupport>[0]["appSettings"], extra: Partial<Parameters<typeof createSupport>[0]> = {}) => {
    const navigate = vi.fn();
    const block = createSupport({ supabase: fakeSupabase().client, navigate, platform: "ios", appSettings, ...extra });
    return { block, navigate };
  };

  it("fills the options the app left out, and an option given wins", () => {
    const { block } = make({ "support.ideas": false, "support.replyExpectation": "within a day", "diagnostics.dumpOnShake": false, "shake.threshold": 3 });
    expect(block.options).toMatchObject({ ideas: false, replyExpectation: "within a day", dumpOnShake: false, shake: { threshold: 3, jolts: 2 } });
    const given = make({ "support.ideas": false }, { ideas: true, shake: { threshold: 4 } }).block;
    expect(given.options).toMatchObject({ ideas: true, shake: { threshold: 4 } });
  });

  it("leaves out the Settings rows for a feature that is off, as the setting says now", () => {
    const { block } = make({ "support.inbox": false });
    // Every row is declared; each one's useShown reads its setting on every render of Settings.
    const shown = (id: string) => block.contributes!.settings!.find((r) => r.id === id)!.useShown!();
    expect(shown("support-send-feedback")).toBe(true);
    expect(shown("support-help")).toBe(false);
    expect(supportContributions({ feedback: false, inbox: false }).settings).toEqual([]);
  });

  it("drops the dump everywhere when diagnostics are off", () => {
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport: { name: "x", send: async () => ({ id: "1", shortId: "1" }) } });
    const { block } = make({ "diagnostics.enabled": false }, { diagnostics });
    expect(block.diagnostics).toBeNull();
    expect(block.options.diagnostics).toBeUndefined();
    // The devtools row is there to follow the setting, and draws nothing while it's off.
    const Row = block.contributes!.slots!["devtoolsDiagnostics"] as unknown as (props: { copy: () => void }) => ReactNode;
    expect(Row({ copy: () => undefined })).toBeNull();
  });

  it("sends no dump while a settings function has never answered, and keeps the last answer after", () => {
    let fails = true;
    let values: Record<string, unknown> = {};
    const read = () => {
      if (fails) throw new Error("not loaded");
      return values;
    };
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport: { name: "x", send: async () => ({ id: "1", shortId: "1" }) }, appSettings: read });
    const { block } = make(read, { diagnostics });
    expect(block.diagnostics).toBeNull();
    expect(diagnostics.enabled).toBe(false);
    fails = false;
    expect(block.diagnostics).toBe(diagnostics);
    expect(diagnostics.enabled).toBe(true);
    values = { "diagnostics.enabled": false };
    expect(block.diagnostics).toBeNull();
    expect(diagnostics.enabled).toBe(false);
    fails = true;
    expect(block.diagnostics).toBeNull();
    expect(diagnostics.enabled).toBe(false);
  });

  it("reads diagnostics.* when a dump would go, not once at creation", () => {
    let values: Record<string, unknown> = { "diagnostics.enabled": false, "diagnostics.dumpOnFeedback": false };
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport: { name: "x", send: async () => ({ id: "1", shortId: "1" }) }, appSettings: () => values });
    const { block } = make(() => values, { diagnostics });
    expect(block.diagnostics).toBeNull();
    expect(diagnostics.enabled).toBe(false);
    expect(block.options.dumpOnFeedback).toBe(false);
    values = { "diagnostics.enabled": true, "diagnostics.dumpOnShake": false };
    expect(block.diagnostics).toBe(diagnostics);
    expect(diagnostics.enabled).toBe(true);
    expect(block.options).toMatchObject({ dumpOnFeedback: true, dumpOnShake: false });
  });

  it("reads the person's shake.enabled at each shake", async () => {
    let shakeOn = true;
    const acc = accelerometer();
    let t = 0;
    const { block, navigate } = make(() => ({ "shake.enabled": shakeOn }), { accelerometer: acc, shake: { now: () => t } });
    const client = new QueryClient();
    const Root = block.Root;
    const wrap = (children: ReactNode) => (
      <QueryClientProvider client={client}>
        <Root>{children}</Root>
      </QueryClientProvider>
    );
    render(wrap(<span />));
    shakeOn = false;
    acc.jolt(3);
    t = 100;
    acc.jolt(3);
    await new Promise((r) => setTimeout(r, 10));
    expect(navigate).not.toHaveBeenCalled();
    shakeOn = true;
    t = 10_000;
    acc.jolt(3);
    t = 10_100;
    acc.jolt(3);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/support/new"));
  });
});

describe("FeedbackPanel with settings", () => {
  it("asks severity and offers pins as the settings say; a prop wins", () => {
    const submit = vi.fn();
    const { unmount } = render(<FeedbackPanel client={{ submit }} screenshots={false} appSettings={{ "support.pins": false, "support.severity": true }} />);
    expect(screen.getByTestId("genesis-support-severity-high")).toBeTruthy();
    expect(screen.queryByTestId("genesis-support-pin")).toBeNull();
    unmount();
    render(<FeedbackPanel client={{ submit }} screenshots={false} severity={false} appSettings={{ "support.severity": true }} />);
    expect(screen.queryByTestId("genesis-support-severity-high")).toBeNull();
    fireEvent.click(screen.getByTestId("genesis-support-type-idea"));
  });
});
