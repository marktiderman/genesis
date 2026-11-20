// @feat:settings-screen
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenesisSettings, type GenesisSettingsProps } from "../settings-react";
import { SettingsProtocolError } from "../settings-protocol";
import { ALL_CAPS, APP_CAPS, LEAKED, fakeClient, makeState } from "./settings-fixture";

async function renderSettings(props: Partial<GenesisSettingsProps> & { client: GenesisSettingsProps["client"] }) {
  const utils = render(<GenesisSettings {...props} />);
  await screen.findByTestId("genesis-settings-tab-values");
  return utils;
}

/** Types into an uncontrolled input as a person would: the value, then an input event. */
function typeSecret(input: HTMLInputElement, value: string) {
  input.value = value;
  fireEvent.input(input);
}

const row = (key: string) => screen.getByTestId(`genesis-settings-row-${key}`);

describe("GenesisSettings: Values", () => {
  it("shows each value with the layer it came from and its lock", async () => {
    await renderSettings({ client: fakeClient(makeState()) });
    expect(within(row("support.retentionDays")).getByTestId("genesis-settings-row-support.retentionDays-source").dataset.layer).toBe("database");
    expect(within(row("support.retentionDays")).getByTestId("genesis-settings-row-support.retentionDays-value").textContent).toBe("30");
    expect(within(row("support.messenger")).getByTestId("genesis-settings-row-support.messenger-source").dataset.layer).toBe("default");
    expect(within(row("app.region")).getByTestId("genesis-settings-row-app.region-source").dataset.layer).toBe("file");
    const lock = within(row("app.theme")).getByTestId("genesis-settings-row-app.theme-lock");
    expect(lock.dataset.layer).toBe("file");
    expect(lock.textContent).toContain("Locked by File");
    expect(screen.getByTestId("genesis-settings-namespace-support")).toBeTruthy();
    expect(screen.getByTestId("genesis-settings-namespace-app")).toBeTruthy();
  });

  it("on the app host, writes runtime keys only and sends build keys to the repo", async () => {
    await renderSettings({ client: fakeClient(makeState(APP_CAPS)) });
    expect(within(row("support.retentionDays")).queryByTestId("genesis-settings-row-support.retentionDays-edit")).toBeTruthy();
    expect(within(row("app.region")).queryByTestId("genesis-settings-row-app.region-edit")).toBeNull();
    expect(within(row("app.region")).queryByTestId("genesis-settings-row-app.region-repo")).toBeTruthy();
    // Locked by the file layer: the database can't change it, so it changes in the repo, where the lock lives.
    expect(within(row("app.theme")).queryByTestId("genesis-settings-row-app.theme-edit")).toBeNull();
    expect(within(row("app.theme")).queryByTestId("genesis-settings-row-app.theme-repo")).toBeTruthy();
  });

  it("lets the capabilities prop narrow a host that can do everything, never widen", async () => {
    await renderSettings({ client: fakeClient(makeState(ALL_CAPS)), capabilities: APP_CAPS });
    expect(within(row("app.region")).queryByTestId("genesis-settings-row-app.region-edit")).toBeNull();
    expect(within(row("support.messenger")).queryByTestId("genesis-settings-row-support.messenger-edit")).toBeTruthy();
  });

  it("writes nothing on a read-only host, whatever the prop says", async () => {
    await renderSettings({ client: fakeClient(makeState({ ...APP_CAPS, writeDatabase: false })), capabilities: ALL_CAPS });
    expect(screen.queryAllByRole("button", { name: /^Edit / })).toHaveLength(0);
  });

  it("saves an edit in the database layer and reloads", async () => {
    const client = fakeClient(makeState(APP_CAPS));
    await renderSettings({ client });
    fireEvent.click(within(row("support.messenger")).getByTestId("genesis-settings-row-support.messenger-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-input"));
    fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-lock"));
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-save"));
    });
    expect(client.setValue).toHaveBeenCalledWith({ key: "support.messenger", value: false, locked: true, layer: "database" });
    await waitFor(() => expect(client.state).toHaveBeenCalledTimes(2));
  });

  it("checks a value against the key's bounds before saving", async () => {
    const client = fakeClient(makeState(APP_CAPS));
    await renderSettings({ client });
    fireEvent.click(within(row("support.retentionDays")).getByTestId("genesis-settings-row-support.retentionDays-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    const input = within(sheet).getByTestId("genesis-settings-value-sheet-input") as HTMLInputElement;
    expect(input.value).toBe("30");
    fireEvent.change(input, { target: { value: "3" } });
    expect(within(sheet).getByTestId("genesis-settings-value-sheet-problem").textContent).toBe("must be at least 7");
    expect((within(sheet).getByTestId("genesis-settings-value-sheet-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears the layer's own value", async () => {
    const client = fakeClient(makeState(APP_CAPS));
    await renderSettings({ client });
    fireEvent.click(within(row("support.retentionDays")).getByTestId("genesis-settings-row-support.retentionDays-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-clear"));
    });
    expect(client.clearValue).toHaveBeenCalledWith({ key: "support.retentionDays", layer: "database" });
  });

  it("offers the CLI host both layers for a runtime key, the file layer first", async () => {
    const client = fakeClient(makeState(ALL_CAPS));
    await renderSettings({ client });
    fireEvent.click(within(row("support.messenger")).getByTestId("genesis-settings-row-support.messenger-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    expect(within(sheet).getByTestId("genesis-settings-value-sheet-layer-file").getAttribute("data-state")).toBe("checked");
    expect(within(sheet).getByTestId("genesis-settings-value-sheet-layer-database").getAttribute("data-state")).toBe("unchecked");
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-save"));
    });
    expect(client.setValue).toHaveBeenCalledWith(expect.objectContaining({ key: "support.messenger", layer: "file" }));
  });

  it("opens a value that comes from the database on the database layer", async () => {
    await renderSettings({ client: fakeClient(makeState(ALL_CAPS)) });
    fireEvent.click(within(row("support.retentionDays")).getByTestId("genesis-settings-row-support.retentionDays-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    expect(within(sheet).getByTestId("genesis-settings-value-sheet-layer-database").getAttribute("data-state")).toBe("checked");
  });

  it("follows the chosen layer's own lock, and says when a higher layer overrides it", async () => {
    const state = makeState(ALL_CAPS);
    state.layers.database = { ...state.layers.database, "support.retentionDays": { value: 30, locked: true } };
    await renderSettings({ client: fakeClient(state) });
    fireEvent.click(within(row("support.retentionDays")).getByTestId("genesis-settings-row-support.retentionDays-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    const lock = () => within(sheet).getByTestId("genesis-settings-value-sheet-lock").getAttribute("data-state");
    // It opens on the database, where the value and its lock are.
    expect(lock()).toBe("checked");
    expect(within(sheet).queryByTestId("genesis-settings-value-sheet-overridden")).toBeNull();
    // The file layer has no lock of its own, and the database's value overrides it.
    fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-layer-file"));
    expect(lock()).toBe("unchecked");
    expect(within(sheet).getByTestId("genesis-settings-value-sheet-overridden").textContent).toContain("Database overrides");
    fireEvent.click(within(sheet).getByTestId("genesis-settings-value-sheet-layer-database"));
    expect(lock()).toBe("checked");
  });

  it("returns focus to the Edit button when the sheet closes with Escape", async () => {
    await renderSettings({ client: fakeClient(makeState(APP_CAPS)) });
    const edit = within(row("support.messenger")).getByTestId("genesis-settings-row-support.messenger-edit");
    edit.focus();
    fireEvent.click(edit);
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("genesis-settings-value-sheet")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(edit));
  });

  it("marks a value that doesn't fit as invalid, described by its problem", async () => {
    await renderSettings({ client: fakeClient(makeState(APP_CAPS)) });
    fireEvent.click(within(row("support.retentionDays")).getByTestId("genesis-settings-row-support.retentionDays-edit"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    const input = within(sheet).getByTestId("genesis-settings-value-sheet-input");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(input, { target: { value: "3" } });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)!.textContent).toBe("must be at least 7");
  });

  it("shows the genesis.config.json change for a build key, and opens a PR only when the host can", async () => {
    const client = fakeClient(makeState(APP_CAPS));
    await renderSettings({ client });
    fireEvent.click(within(row("app.region")).getByTestId("genesis-settings-row-app.region-repo"));
    const sheet = await screen.findByTestId("genesis-settings-value-sheet");
    expect(JSON.parse(within(sheet).getByTestId("genesis-settings-value-sheet-snippet").textContent!)).toEqual({ settings: { "app.region": "eu" } });
    expect(within(sheet).queryByTestId("genesis-settings-value-sheet-propose")).toBeNull();
    expect(within(sheet).queryByTestId("genesis-settings-value-sheet-save")).toBeNull();
  });

  it("filters by key", async () => {
    await renderSettings({ client: fakeClient(makeState()) });
    fireEvent.change(screen.getByTestId("genesis-settings-filter"), { target: { value: "region" } });
    expect(screen.queryByTestId("genesis-settings-row-support.messenger")).toBeNull();
    expect(row("app.region")).toBeTruthy();
  });

  it("takes copy overrides", async () => {
    await renderSettings({ client: fakeClient(makeState()), copy: { title: "Platform settings", layers: { default: "Standard", preset: "Preset", file: "Repo", database: "Live", tenant: "Tenant", person: "Person" } } });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Platform settings");
    expect(within(row("support.retentionDays")).getByText("Live")).toBeTruthy();
  });

  it("leaves the title to the host page with header={false}", async () => {
    await renderSettings({ client: fakeClient(makeState()), header: false });
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByTestId("genesis-settings-refresh")).toBeTruthy();
  });

  it("names the Health count for a screen reader", async () => {
    await renderSettings({ client: fakeClient(makeState()) });
    expect(screen.getByTestId("genesis-settings-health-count").textContent).toBe(" (3 findings)");
  });

  it("shows a load error with a retry", async () => {
    const client = fakeClient(makeState());
    client.state.mockRejectedValueOnce(new SettingsProtocolError("forbidden", "Platform admins only.", 403));
    render(<GenesisSettings client={client} />);
    expect((await screen.findByTestId("genesis-settings-load-error")).textContent).toContain("Platform admins only.");
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-retry"));
    });
    expect(await screen.findByTestId("genesis-settings-tab-values")).toBeTruthy();
  });
});

describe("GenesisSettings: Health", () => {
  it("plans, asks to confirm, then applies with the plan's hash", async () => {
    const client = fakeClient(makeState(ALL_CAPS));
    await renderSettings({ client, defaultTab: "health" });
    fireEvent.click(screen.getByTestId("genesis-settings-finding-f1-fix"));
    const sheet = await screen.findByTestId("genesis-settings-plan-sheet");
    await within(sheet).findByTestId("genesis-settings-plan-sheet-files");
    expect(client.plan).toHaveBeenCalledWith("agents.guide");
    fireEvent.click(within(sheet).getByTestId("genesis-settings-plan-sheet-apply"));
    expect(client.apply).not.toHaveBeenCalled();
    const confirm = await screen.findByTestId("genesis-settings-plan-sheet-confirm");
    expect(confirm.textContent).toContain("It writes 1 file and runs 0 commands.");
    await act(async () => {
      fireEvent.click(within(confirm).getByTestId("genesis-settings-plan-sheet-confirm-apply"));
    });
    expect(client.apply).toHaveBeenCalledWith("agents.guide", "hash-1");
    expect((await screen.findByTestId("genesis-settings-plan-sheet-result")).textContent).toContain("Applied and verified.");
  });

  it("never shows or applies a late plan for another fix", async () => {
    const state = makeState(ALL_CAPS);
    state.findings = [...state.findings, { id: "f4", rule: "other-rule", level: "warn", message: "Other.", fix: { id: "other.fix", kind: "auto" } }];
    const client = fakeClient(state);
    let releaseA: () => void = () => {};
    const planFor = (fixId: string) => ({ fixId, summary: `Plan for ${fixId}`, hash: `hash-${fixId}`, files: [{ path: `${fixId}.txt`, why: "w" }], commands: [], secrets: [] });
    client.plan.mockImplementationOnce((fixId: string) => new Promise((resolve) => (releaseA = () => resolve(planFor(fixId)))));
    client.plan.mockImplementationOnce(async (fixId: string) => planFor(fixId));
    await renderSettings({ client, defaultTab: "health" });
    fireEvent.click(screen.getByTestId("genesis-settings-finding-f1-fix"));
    const first = await screen.findByTestId("genesis-settings-plan-sheet");
    await act(async () => {
      fireEvent.keyDown(first, { key: "Escape" });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-finding-f4-fix"));
    });
    const sheet = await screen.findByTestId("genesis-settings-plan-sheet");
    await within(sheet).findByText("other.fix.txt");
    // Fix A's plan arrives after B's: it is dropped.
    await act(async () => releaseA());
    expect(within(sheet).queryByText("agents.guide.txt")).toBeNull();
    fireEvent.click(within(sheet).getByTestId("genesis-settings-plan-sheet-apply"));
    await act(async () => {
      fireEvent.click(await screen.findByTestId("genesis-settings-plan-sheet-confirm-apply"));
    });
    expect(client.apply).toHaveBeenCalledWith("other.fix", "hash-other.fix");
    expect(client.apply).toHaveBeenCalledTimes(1);
  });

  it("offers to plan again when the plan went stale", async () => {
    const client = fakeClient(makeState(ALL_CAPS));
    client.apply.mockRejectedValueOnce(new SettingsProtocolError("stale_plan", "hash changed", 409));
    await renderSettings({ client, defaultTab: "health" });
    fireEvent.click(screen.getByTestId("genesis-settings-finding-f1-fix"));
    const sheet = await screen.findByTestId("genesis-settings-plan-sheet");
    fireEvent.click(await within(sheet).findByTestId("genesis-settings-plan-sheet-apply"));
    await act(async () => {
      fireEvent.click(await screen.findByTestId("genesis-settings-plan-sheet-confirm-apply"));
    });
    expect((await screen.findByTestId("genesis-settings-plan-sheet-error")).textContent).toContain("Something changed since this plan was made.");
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-plan-sheet-replan"));
    });
    expect(client.plan).toHaveBeenCalledTimes(2);
  });

  it("won't apply a plan that needs more than the host can do", async () => {
    const client = fakeClient(makeState({ ...ALL_CAPS, writeFiles: false }));
    await renderSettings({ client, defaultTab: "health" });
    fireEvent.click(screen.getByTestId("genesis-settings-finding-f1-fix"));
    const sheet = await screen.findByTestId("genesis-settings-plan-sheet");
    expect((await within(sheet).findByTestId("genesis-settings-plan-sheet-needs")).textContent).toContain("genesis fix agents.guide");
    expect(within(sheet).queryByTestId("genesis-settings-plan-sheet-apply")).toBeNull();
  });

  it("lets the app host apply a fix that writes only the database layer", async () => {
    const state = makeState(APP_CAPS);
    state.findings = [{ id: "d1", rule: "settings-seed", level: "warn", message: "Runtime settings aren't seeded.", fix: { id: "settings.seed", kind: "auto", databaseOnly: true } }];
    const client = fakeClient(state);
    client.plan.mockResolvedValueOnce({ fixId: "settings.seed", summary: "Seed", hash: "h", files: [], commands: [], secrets: [], layers: ["database"] });
    await renderSettings({ client, defaultTab: "health" });
    fireEvent.click(screen.getByTestId("genesis-settings-finding-d1-fix"));
    const sheet = await screen.findByTestId("genesis-settings-plan-sheet");
    expect(await within(sheet).findByTestId("genesis-settings-plan-sheet-apply")).toBeTruthy();
    expect(within(sheet).queryByTestId("genesis-settings-plan-sheet-needs")).toBeNull();
  });

  it("follows only http, https and same-site links", async () => {
    const state = makeState(APP_CAPS);
    state.findings = [{ id: "g1", rule: "secret-missing", level: "error", message: "x", fix: { id: "s", kind: "guided", step: "github.issues", href: "javascript:alert(1)" } }];
    state.upgrades = { packages: [{ name: "pkg", current: "1.0.0", distance: "current", notesUrl: "javascript:alert(1)" }] };
    await renderSettings({ client: fakeClient(state), defaultTab: "health" });
    expect(screen.queryByTestId("genesis-settings-finding-g1-step")).toBeNull();
    expect(screen.getByTestId("genesis-settings-finding-g1-cli").textContent).toContain("genesis setup --step github.issues");
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it("on the app host, shows the CLI command instead of a fix button", async () => {
    await renderSettings({ client: fakeClient(makeState(APP_CAPS)), defaultTab: "health" });
    expect(screen.queryByTestId("genesis-settings-finding-f1-fix")).toBeNull();
    expect(screen.getByTestId("genesis-settings-finding-f1-cli").textContent).toContain("genesis fix agents.guide");
    expect(screen.getByTestId("genesis-settings-finding-f2-cli").textContent).toContain("genesis setup --step github.issues");
  });

  it("opens a guided step through onOpenStep, and shows a manual fix's instructions", async () => {
    const opened: string[] = [];
    await renderSettings({ client: fakeClient(makeState(APP_CAPS)), defaultTab: "health", onOpenStep: (s) => opened.push(s) });
    fireEvent.click(screen.getByTestId("genesis-settings-finding-f2-step"));
    expect(opened).toEqual(["github.issues"]);
    fireEvent.click(screen.getByTestId("genesis-settings-finding-f3-how"));
    expect((await screen.findByTestId("genesis-settings-finding-f3-instructions")).textContent).toBe("Use Button from genesis-ui.");
  });

  it("lists errors first", async () => {
    await renderSettings({ client: fakeClient(makeState()), defaultTab: "health" });
    const ids = Array.from(document.querySelectorAll("[data-testid^='genesis-settings-finding-']"))
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => /^genesis-settings-finding-f\d$/.test(id ?? ""));
    expect(ids).toEqual(["genesis-settings-finding-f2", "genesis-settings-finding-f1", "genesis-settings-finding-f3"]);
  });
});

describe("GenesisSettings: Secrets", () => {
  it("shows set or missing by name and never a value", async () => {
    await renderSettings({ client: fakeClient(makeState()), defaultTab: "secrets" });
    expect(screen.getByTestId("genesis-settings-secret-GITHUB_TOKEN-status").dataset.status).toBe("missing");
    expect(screen.getByTestId("genesis-settings-secret-RESEND_API_KEY-status").dataset.status).toBe("set");
    expect(document.body.textContent).not.toContain(LEAKED);
  });

  it("never draws a secret's value in the audit history either", async () => {
    await renderSettings({ client: fakeClient(makeState()), defaultTab: "audit" });
    expect(screen.getByTestId("genesis-settings-audit-a2").textContent).toContain("RESEND_API_KEY");
    expect(document.body.textContent).not.toContain(LEAKED);
  });

  it("hides before and after for a set on a secret's name and for a fix", async () => {
    const state = makeState();
    state.audit = {
      entries: [
        { id: "l1", at: "2026-11-18T10:00:00Z", action: "set", subject: "RESEND_API_KEY", after: LEAKED },
        { id: "l2", at: "2026-11-18T10:00:00Z", action: "fix", subject: "agents.guide", after: { GITHUB_TOKEN: LEAKED } },
        { id: "l3", at: "2026-11-18T10:00:00Z", action: "set", subject: "support.githubRepo", before: null, after: LEAKED },
        { id: "l4", at: "2026-11-18T10:00:00Z", action: "set", subject: "GITHUB_TOKEN", after: LEAKED },
      ],
    };
    await renderSettings({ client: fakeClient(state), defaultTab: "audit" });
    expect(screen.getByTestId("genesis-settings-audit-l1").textContent).toContain("RESEND_API_KEY");
    expect(screen.getByTestId("genesis-settings-audit-l2")).toBeTruthy();
    expect(document.body.textContent).not.toContain(LEAKED);
  });

  it("sets or rotates a Vault secret write-only, when the host allows it", async () => {
    const state = makeState({ ...APP_CAPS, setSecrets: { vault: true } });
    state.secrets = [...state.secrets, { name: "CRON_SECRET", store: "vault", status: "set", neededBy: ["jobs.nightly"] }];
    const client = fakeClient(state);
    client.setSecret = vi.fn(async () => undefined);
    await renderSettings({ client, defaultTab: "secrets" });
    // Edge secrets aren't settable here; the Vault one is.
    expect(screen.queryByTestId("genesis-settings-secret-GITHUB_TOKEN-set")).toBeNull();
    fireEvent.click(screen.getByTestId("genesis-settings-secret-CRON_SECRET-set"));
    const sheet = await screen.findByTestId("genesis-settings-secret-sheet");
    const input = within(sheet).getByTestId("genesis-settings-secret-sheet-input") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("");
    typeSecret(input, "sk-new-value");
    // Uncontrolled: the typed value never reaches the markup.
    expect(input.outerHTML).not.toContain("sk-new-value");
    expect(document.body.innerHTML).not.toContain("sk-new-value");
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("genesis-settings-secret-sheet-save"));
    });
    expect(client.setSecret).toHaveBeenCalledWith({ name: "CRON_SECRET", store: "vault", value: "sk-new-value" });
    await waitFor(() => expect(screen.queryByTestId("genesis-settings-secret-sheet")).toBeNull());
    expect(input.value).toBe("");
    expect(document.body.innerHTML).not.toContain("sk-new-value");
  });

  it("clears the field and never echoes the value when setting a secret fails", async () => {
    const state = makeState({ ...APP_CAPS, setSecrets: { vault: true } });
    state.secrets = [{ name: "CRON_SECRET", store: "vault", status: "missing", neededBy: [] }];
    const client = fakeClient(state);
    client.setSecret = vi.fn(async ({ value }: { value: string }) => {
      throw new SettingsProtocolError("bad_request", `rejected ${value}: ${value} is too short`, 400);
    });
    await renderSettings({ client, defaultTab: "secrets" });
    fireEvent.click(screen.getByTestId("genesis-settings-secret-CRON_SECRET-set"));
    const sheet = await screen.findByTestId("genesis-settings-secret-sheet");
    const input = within(sheet).getByTestId("genesis-settings-secret-sheet-input") as HTMLInputElement;
    typeSecret(input, "hunter2");
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("genesis-settings-secret-sheet-save"));
    });
    expect(within(sheet).getByTestId("genesis-settings-secret-sheet-error").textContent).toContain("rejected •••: ••• is too short");
    expect(input.value).toBe("");
    expect(document.body.innerHTML).not.toContain("hunter2");
  });

  it("offers no Vault writes when the host doesn't say it can", async () => {
    const state = makeState(APP_CAPS);
    state.secrets = [{ name: "CRON_SECRET", store: "vault", status: "missing", neededBy: [] }];
    const client = fakeClient(state);
    client.setSecret = vi.fn(async () => undefined);
    await renderSettings({ client, defaultTab: "secrets", capabilities: { setSecrets: { vault: true } } });
    expect(screen.queryByTestId("genesis-settings-secret-CRON_SECRET-set")).toBeNull();
  });
});

describe("GenesisSettings: Upgrades", () => {
  it("opens an upgrade PR through the plan when the host can run the CLI", async () => {
    const client = fakeClient(makeState(ALL_CAPS));
    await renderSettings({ client, defaultTab: "upgrades" });
    expect(screen.getByTestId("genesis-settings-upgrade--marktiderman-genesis-ui-distance").textContent).toBe("Minor behind");
    fireEvent.click(screen.getByTestId("genesis-settings-upgrades-pr"));
    await screen.findByTestId("genesis-settings-plan-sheet");
    expect(client.plan).toHaveBeenCalledWith("upgrade.release");
  });

  it("shows genesis upgrade instead on the app host, and checks again on request", async () => {
    const client = fakeClient(makeState(APP_CAPS));
    await renderSettings({ client, defaultTab: "upgrades" });
    expect(screen.queryByTestId("genesis-settings-upgrades-pr")).toBeNull();
    expect(screen.getByTestId("genesis-settings-upgrades-cli").textContent).toContain("genesis upgrade");
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-upgrades-check"));
    });
    expect(client.upgrades).toHaveBeenCalledWith({ refresh: true });
  });
});

describe("GenesisSettings: refreshed data wins over an older request", () => {
  it("an upgrade check in flight when Refresh lands never replaces the refreshed list", async () => {
    const state = makeState(APP_CAPS);
    const client = fakeClient(state);
    let release: () => void = () => {};
    client.upgrades.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ packages: [{ name: "@marktiderman/genesis-ui", current: "3.1.0", latest: "3.2.0", distance: "minor" }] }))),
    );
    await renderSettings({ client, defaultTab: "upgrades" });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-upgrades-check"));
    });
    // Refresh: a newer state, whose upgrades say genesis-ui is current.
    client.state.mockResolvedValueOnce({ ...state, upgrades: { packages: [{ name: "@marktiderman/genesis-ui", current: "3.4.0", latest: "3.4.0", distance: "current" }] } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-refresh"));
    });
    await act(async () => release());
    expect(screen.getByTestId("genesis-settings-upgrade--marktiderman-genesis-ui-distance").textContent).not.toBe("Minor behind");
    expect((screen.getByTestId("genesis-settings-upgrades-check") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a Load more in flight when Refresh lands leaves Load more usable", async () => {
    const state = makeState();
    const client = fakeClient(state);
    client.audit.mockImplementationOnce(() => new Promise(() => {}));
    await renderSettings({ client, defaultTab: "audit", auditPageSize: 2 });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-audit-more"));
    });
    expect((screen.getByTestId("genesis-settings-audit-more") as HTMLButtonElement).disabled).toBe(true);
    client.state.mockResolvedValueOnce({ ...state, audit: { entries: [...state.audit!.entries], next: "cursor-9" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-refresh"));
    });
    expect((screen.getByTestId("genesis-settings-audit-more") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("GenesisSettings: Audit", () => {
  it("shows changes with their layer and loads the next page", async () => {
    const client = fakeClient(makeState());
    await renderSettings({ client, defaultTab: "audit", auditPageSize: 2 });
    expect(screen.getByTestId("genesis-settings-audit-a1").textContent).toContain("30");
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-settings-audit-more"));
    });
    expect(client.audit).toHaveBeenCalledWith({ cursor: "cursor-2", limit: 2 });
    expect(await screen.findByTestId("genesis-settings-audit-a3")).toBeTruthy();
    expect(screen.queryByTestId("genesis-settings-audit-more")).toBeNull();
  });

  it("fetches the first page itself when the state has no history", async () => {
    const client = fakeClient(makeState(APP_CAPS, { audit: undefined }));
    await renderSettings({ client, defaultTab: "audit", auditPageSize: 5 });
    expect(await screen.findByTestId("genesis-settings-audit-a3")).toBeTruthy();
    expect(client.audit).toHaveBeenCalledWith({ limit: 5 });
  });

  it("switches tabs from the keyboard-accessible tablist", async () => {
    await renderSettings({ client: fakeClient(makeState()) });
    const tab = screen.getByTestId("genesis-settings-tab-audit");
    expect(tab.getAttribute("role")).toBe("tab");
    fireEvent.mouseDown(tab, { button: 0 });
    expect(await screen.findByTestId("genesis-settings-audit-a1")).toBeTruthy();
  });
});
