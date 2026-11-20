// @feat:settings-screen
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenesisSettings } from "../settings-react";
import { defineSettings, resolveSettings, settingsCatalogue, settingsLayerFromRows } from "../settings";
import type { SettingsCapabilities, SettingsClient, SettingsProposalEntry, SettingsState, SettingsViewer } from "../settings-protocol";

const TENANT = "00000000-0000-4000-9000-00000000000a";

const catalogue = settingsCatalogue([
  defineSettings("demo", {
    theme: { type: "string", default: "light", options: ["light", "dark"] },
    banner: { type: "boolean", default: true, scope: "tenant", summary: "Show the promotion banner." },
    seats: { type: "number", default: 10, min: 1, max: 100, scope: "tenant" },
    shake: { type: "boolean", default: true, scope: "person" },
  }),
]);

const SCOPED: SettingsCapabilities = { writeFiles: false, writeDatabase: true, setSecrets: false, runCli: false, agent: false, proposeChanges: true };
const PLATFORM: SettingsCapabilities = { writeFiles: false, writeDatabase: true, setSecrets: { vault: true }, runCli: false, agent: false, proposeChanges: false };

/** What the app host answers: the whole catalogue (a host might), the viewer, and its layers. */
function stateFor(viewer: SettingsViewer, proposals: SettingsProposalEntry[] = []): SettingsState {
  // The app locked demo.seats in its database: a tenant admin proposes instead of editing.
  const database = settingsLayerFromRows([{ key: "demo.seats", value: 20, locked: true }]);
  const tenant = settingsLayerFromRows([{ key: "demo.banner", value: false }]);
  const person = settingsLayerFromRows([{ key: "demo.shake", value: false }]);
  return {
    app: { name: "Acme", host: "app", preset: "max" },
    catalogue: Object.values(catalogue.keys),
    resolved: resolveSettings(catalogue, { database, tenant, person }),
    layers: viewer.scope === "tenant" ? { tenant } : viewer.scope === "person" ? { person } : { database },
    findings: viewer.scope === "platform" ? [{ id: "f1", rule: "secret-missing", level: "warn", message: "DEMO_WEBHOOK isn't in Vault yet." }] : [],
    secrets: [],
    capabilities: viewer.scope === "platform" ? PLATFORM : SCOPED,
    audit: { entries: [] },
    viewer,
    proposals,
  };
}

function client(state: SettingsState) {
  return {
    state: vi.fn(async () => state),
    setValue: vi.fn(async () => undefined),
    clearValue: vi.fn(async () => undefined),
    plan: vi.fn(),
    apply: vi.fn(),
    upgrades: vi.fn(async () => ({ packages: [] })),
    audit: vi.fn(async () => ({ entries: [] })),
    propose: vi.fn(async () => ({ id: "7" })),
    decideProposal: vi.fn(async () => undefined),
  } satisfies SettingsClient;
}

const row = (key: string) => screen.getByTestId(`genesis-settings-row-${key}`);

describe("GenesisSettings: the tenant admin's slice", () => {
  it("asks the host for the tenant and shows only the tenant-scope keys", async () => {
    const c = client(stateFor({ scope: "tenant", tenant: TENANT }));
    render(<GenesisSettings client={c} tenant={TENANT} />);
    await screen.findByTestId("genesis-settings-tab-values");
    expect(c.state).toHaveBeenCalledWith({ auditLimit: 25, tenant: TENANT });
    expect(screen.getByTestId("genesis-settings-row-demo.banner")).toBeTruthy();
    expect(screen.getByTestId("genesis-settings-row-demo.seats")).toBeTruthy();
    expect(screen.queryByTestId("genesis-settings-row-demo.theme")).toBeNull();
    expect(screen.queryByTestId("genesis-settings-row-demo.shake")).toBeNull();
    // Values and Audit only: no Health, Secrets or Upgrades.
    expect(screen.queryByTestId("genesis-settings-tab-health")).toBeNull();
    expect(screen.queryByTestId("genesis-settings-tab-secrets")).toBeNull();
    expect(screen.queryByTestId("genesis-settings-tab-upgrades")).toBeNull();
    expect(screen.getByTestId("genesis-settings-tab-audit")).toBeTruthy();
    expect(screen.getByText(/Your organization's settings/)).toBeTruthy();
  });

  it("writes the tenant layer for that tenant, without a lock", async () => {
    const c = client(stateFor({ scope: "tenant", tenant: TENANT }));
    render(<GenesisSettings client={c} tenant={TENANT} />);
    await screen.findByTestId("genesis-settings-tab-values");
    fireEvent.click(within(row("demo.banner")).getByTestId("genesis-settings-row-demo.banner-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    expect(within(sheet).queryByTestId("genesis-settings-value-sheet-lock")).toBeNull();
    fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-input"));
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-save"));
    });
    expect(c.setValue).toHaveBeenCalledWith({ key: "demo.banner", value: true, layer: "tenant", tenant: TENANT });
  });

  it("clears the tenant's own value for that tenant", async () => {
    const c = client(stateFor({ scope: "tenant", tenant: TENANT }));
    render(<GenesisSettings client={c} tenant={TENANT} />);
    await screen.findByTestId("genesis-settings-tab-values");
    fireEvent.click(within(row("demo.banner")).getByTestId("genesis-settings-row-demo.banner-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-clear"));
    });
    expect(c.clearValue).toHaveBeenCalledWith({ key: "demo.banner", layer: "tenant", tenant: TENANT });
  });

  it("proposes, with why, a value the app locked", async () => {
    const c = client(stateFor({ scope: "tenant", tenant: TENANT }));
    render(<GenesisSettings client={c} tenant={TENANT} />);
    await screen.findByTestId("genesis-settings-tab-values");
    expect(within(row("demo.seats")).queryByTestId("genesis-settings-row-demo.seats-edit")).toBeNull();
    fireEvent.click(within(row("demo.seats")).getByTestId("genesis-settings-row-demo.seats-propose"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    fireEvent.change(within(sheet).getByTestId("genesis-settings-value-sheet-input"), { target: { value: "40" } });
    fireEvent.change(within(sheet).getByTestId("genesis-settings-value-sheet-reason"), { target: { value: "We hired" } });
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-send"));
    });
    expect(c.propose).toHaveBeenCalledWith({ key: "demo.seats", value: 40, reason: "We hired", tenant: TENANT });
    expect(await within(sheet).findByTestId("genesis-settings-value-sheet-proposal")).toBeTruthy();
  });

  it("pages the tenant's history for that tenant", async () => {
    const state = { ...stateFor({ scope: "tenant", tenant: TENANT }), audit: undefined };
    const c = client(state);
    render(<GenesisSettings client={c} tenant={TENANT} defaultTab="audit" />);
    await waitFor(() => expect(c.audit).toHaveBeenCalledWith({ limit: 25, tenant: TENANT }));
  });

  it("shows how the tenant admin's own proposals were decided", async () => {
    const c = client(stateFor({ scope: "tenant", tenant: TENANT }, [{ id: "3", key: "demo.seats", value: 40, proposedAt: "2026-11-20T00:00:00Z", status: "declined" }]));
    render(<GenesisSettings client={c} tenant={TENANT} />);
    await screen.findByTestId("genesis-settings-tab-values");
    expect(screen.getByTestId("genesis-settings-proposal-3-status").textContent).toBe("Declined");
    expect(screen.queryByTestId("genesis-settings-proposal-3-approve")).toBeNull();
  });
});

describe("GenesisSettings: the person's slice", () => {
  it("shows and writes only the person's own keys", async () => {
    const c = client(stateFor({ scope: "person" }));
    render(<GenesisSettings client={c} />);
    await screen.findByTestId("genesis-settings-tab-values");
    expect(screen.getByTestId("genesis-settings-row-demo.shake")).toBeTruthy();
    expect(screen.queryByTestId("genesis-settings-row-demo.banner")).toBeNull();
    fireEvent.click(within(row("demo.shake")).getByTestId("genesis-settings-row-demo.shake-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-input"));
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-save"));
    });
    expect(c.setValue).toHaveBeenCalledWith({ key: "demo.shake", value: true, layer: "person" });
  });
});

describe("GenesisSettings: the platform admin", () => {
  it("sees every key and every tab, and decides pending proposals", async () => {
    const pending: SettingsProposalEntry = { id: "5", key: "demo.seats", value: 40, reason: "We hired", proposedBy: "ta@acme.test", proposedAt: "2026-11-20T00:00:00Z", status: "pending" };
    const c = client(stateFor({ scope: "platform" }, [pending]));
    render(<GenesisSettings client={c} />);
    await screen.findByTestId("genesis-settings-tab-values");
    for (const key of ["demo.theme", "demo.banner", "demo.seats", "demo.shake"]) expect(screen.getByTestId(`genesis-settings-row-${key}`)).toBeTruthy();
    for (const tab of ["health", "secrets", "upgrades", "audit"]) expect(screen.getByTestId(`genesis-settings-tab-${tab}`)).toBeTruthy();
    expect(screen.getByTestId("genesis-settings-proposal-5-reason").textContent).toBe("We hired");
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-proposal-5-approve"));
    });
    expect(c.decideProposal).toHaveBeenCalledWith({ id: "5", approve: true });
    await waitFor(() => expect(c.state).toHaveBeenCalledTimes(2));
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-proposal-5-decline"));
    });
    expect(c.decideProposal).toHaveBeenLastCalledWith({ id: "5", approve: false });
    // A person's own request: no tenant to approve it for alone.
    expect(screen.getByTestId("genesis-settings-proposal-5-for").textContent).toBe("Asked for themselves");
    expect(screen.queryByTestId("genesis-settings-proposal-5-approve-tenant")).toBeNull();
  });

  it("says whose request it is, that approving is app-wide, and approves for the asking tenant alone when allowed", async () => {
    const TENANT_B = "00000000-0000-4000-9000-00000000000b";
    const proposals: SettingsProposalEntry[] = [
      { id: "6", key: "demo.banner", value: false, proposedBy: "ta@acme.test", tenant: TENANT, proposedAt: "2026-11-20T00:00:00Z", status: "pending", canApproveForTenant: true },
      { id: "7", key: "demo.seats", value: 40, proposedBy: "tb@acme.test", tenant: TENANT_B, proposedAt: "2026-11-20T00:00:00Z", status: "pending" },
    ];
    const c = client(stateFor({ scope: "platform" }, proposals));
    render(<GenesisSettings client={c} />);
    await screen.findByTestId("genesis-settings-tab-values");
    expect(screen.getByTestId("genesis-settings-proposal-6-for").textContent).toBe(`Asked for tenant ${TENANT}`);
    expect(screen.getByTestId("genesis-settings-proposal-6-app-wide").textContent).toMatch(/app-wide value/);
    // demo.seats is locked in the database layer: only an app-wide approval can change it.
    expect(screen.queryByTestId("genesis-settings-proposal-7-approve-tenant")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-proposal-6-approve-tenant"));
    });
    expect(c.decideProposal).toHaveBeenCalledWith({ id: "6", approve: true, layer: "tenant" });
  });
});
