import { vi } from "vitest";
import { defineSettings, resolveSettings, settingsCatalogue, settingsLayerFromFile, settingsLayerFromRows } from "../settings";
import type { SettingsCapabilities, SettingsClient, SettingsState } from "../settings-protocol";

export const catalogue = settingsCatalogue([
  defineSettings("support", {
    messenger: { type: "boolean", default: true, summary: "Show the help messenger." },
    retentionDays: { type: "number", default: 90, min: 7, max: 365, summary: "Days to keep dumps." },
    githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN", store: "edge" },
  }),
  defineSettings("app", {
    region: { type: "string", default: "us", options: ["us", "eu"], applies: "build", summary: "Where data lives." },
    theme: { type: "string", default: "light" },
  }),
]);

export const ALL_CAPS: SettingsCapabilities = { writeFiles: true, writeDatabase: true, setSecrets: true, runCli: true, agent: false, proposeChanges: false };
export const APP_CAPS: SettingsCapabilities = { writeFiles: false, writeDatabase: true, setSecrets: false, runCli: false, agent: false, proposeChanges: false };

/** A secret value a broken host might leak: the screen must never draw it. */
export const LEAKED = "ghp_SUPERSECRETVALUE123";

export function makeState(capabilities: SettingsCapabilities = APP_CAPS, overrides: Partial<SettingsState> = {}): SettingsState {
  const file = settingsLayerFromFile({ "app.region": "eu", "app.theme": { value: "dark", locked: true } });
  const database = settingsLayerFromRows([{ key: "support.retentionDays", value: 30 }]);
  return {
    app: { name: "Acme", host: capabilities.writeFiles ? "cli" : "app", preset: "max" },
    catalogue: Object.values(catalogue.keys),
    resolved: resolveSettings(catalogue, { file, database }),
    layers: { file, database },
    findings: [
      { id: "f1", rule: "agents-guide", level: "warn", message: "AGENTS.md is out of date.", file: "AGENTS.md", fix: { id: "agents.guide", kind: "auto" } },
      { id: "f2", rule: "secret-missing", level: "error", message: "GITHUB_TOKEN isn't set.", fix: { id: "setup:github.issues", kind: "guided", step: "github.issues" } },
      { id: "f3", rule: "raw-tag", level: "info", message: "A raw <button>.", file: "src/a.tsx", line: 4, fix: { id: "manual:raw-tag", kind: "manual", instructions: "Use Button from genesis-ui." } },
    ],
    secrets: [
      // A host bug: a value field on the wire. The screen picks fields by name, so it never shows.
      { name: "GITHUB_TOKEN", store: "edge", status: "missing", neededBy: ["support.githubRepo"], value: LEAKED } as SettingsState["secrets"][number],
      { name: "RESEND_API_KEY", store: "edge", status: "set", neededBy: ["notifications.email"], lastRotated: "2026-10-01T00:00:00Z" },
    ],
    capabilities,
    upgrades: {
      packages: [
        { name: "@marktiderman/genesis-ui", current: "3.1.0", latest: "3.4.0", distance: "minor", notes: "New SettingsPage rail." },
        { name: "@marktiderman/genesis-config", current: "0.10.0", latest: "0.10.0", distance: "current" },
      ],
      checkedAt: "2026-11-18T00:00:00Z",
      fix: { id: "upgrade.release", kind: "auto" },
    },
    audit: {
      entries: [
        { id: "a1", at: "2026-11-18T10:00:00Z", actor: "ops@acme.test", action: "set", subject: "support.retentionDays", layer: "database", before: 90, after: 30 },
        { id: "a2", at: "2026-11-17T10:00:00Z", actor: "cli", action: "secret", subject: "RESEND_API_KEY", before: LEAKED, after: LEAKED },
      ],
      next: "cursor-2",
    },
    ...overrides,
  };
}

export function fakeClient(state: SettingsState): SettingsClient & { [K in keyof SettingsClient]: ReturnType<typeof vi.fn> } {
  return {
    state: vi.fn(async () => state),
    setValue: vi.fn(async () => undefined),
    clearValue: vi.fn(async () => undefined),
    plan: vi.fn(async (fixId: string) => ({
      fixId,
      summary: `Plan for ${fixId}`,
      hash: "hash-1",
      files: [{ path: "AGENTS.md", why: "Refresh the guide", diff: "-old\n+new" }],
      commands: [],
      secrets: [],
    })),
    apply: vi.fn(async (fixId: string) => ({ fixId, verified: true })),
    upgrades: vi.fn(async () => state.upgrades!),
    audit: vi.fn(async () => ({ entries: [{ id: "a3", at: "2026-11-01T00:00:00Z", action: "clear" as const, subject: "app.theme", layer: "database" as const }] })),
    propose: vi.fn(async () => ({ snippet: "{}", pullRequestUrl: "https://github.com/acme/app/pull/1" })),
  } as never;
}
