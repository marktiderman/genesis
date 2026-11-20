/**
 * `@marktiderman/genesis-config/settings/react`: the Settings screen, one UI for two hosts (the
 * localhost wizard and the app's platform-admin screen, config-layer §4). It talks to its host
 * only through a {@link SettingsClient}, and shows a write only when the host's capabilities (and
 * the `capabilities` prop, which can only narrow them) allow it.
 *
 * Tabs: Values (every key with its value, the layer it came from and its lock), Health (the
 * doctor's findings with their fixes), Secrets (set or missing, never a value), Upgrades and Audit.
 *
 * Who is looking decides the slice ({@link SettingsViewer}, from the host): a platform admin sees
 * all of it and decides the pending proposals; a tenant admin sees and writes only their tenant's
 * `scope: "tenant"` keys, and a person only their own `scope: "person"` keys, each with Values and
 * Audit, and a Propose button for a key the app locked.
 *
 * Beta: it ships before the maintainer's design review, so its look and props may change in a minor.
 *
 * @stability Beta
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
  InlineAlert,
  Input,
  Label,
  PageLoading,
  RadioGroup,
  RadioGroupItem,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsRow,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@marktiderman/genesis-ui";
import { PageHeader } from "@marktiderman/genesis-ui/layout";
import { SETTINGS_LAYERS, settingValueProblem, type SettingDef, type SettingSource, type SettingsLayer } from "./settings";
import {
  auditValuesVisible,
  canSetSecret,
  intersectCapabilities,
  preferredWriteLayer,
  safeHref,
  secretNames,
  settingFileSnippet,
  settingWritability,
  SettingsProtocolError,
  type SettingsApplyResult,
  type SettingsAuditEntry,
  type SettingsCapabilities,
  type SettingsClient,
  type SettingsFinding,
  type SettingsFindingLevel,
  type SettingsFixRef,
  type SettingsPlan,
  type SettingsProposalEntry,
  type SettingsSecretStatus,
  type SettingsState,
  type SettingsUpgrades,
  type SettingsViewer,
  type SettingsWriteLayer,
  type UpgradeDistance,
} from "./settings-protocol";

/** The screen's tabs. @stability Beta */
export type GenesisSettingsTab = "values" | "health" | "secrets" | "upgrades" | "audit";

/**
 * Every word the screen shows. Pass a partial `copy` to change any of them (a translation, the
 * app's own voice).
 *
 * @stability Beta
 */
export interface GenesisSettingsCopy {
  title: string;
  description: string;
  refresh: string;
  loading: string;
  loadFailed: string;
  retry: string;
  tabs: Record<GenesisSettingsTab, string>;
  layers: Record<SettingsLayer, string>;
  filterLabel: string;
  filterPlaceholder: string;
  noMatches: string;
  notSet: string;
  on: string;
  off: string;
  lockedBy: (layer: string) => string;
  buildOnly: string;
  edit: string;
  /** The Edit button's accessible name. */
  editLabel: (key: string) => string;
  editTitle: (key: string) => string;
  /** Shown when the layer being written sits below the one the value comes from. */
  overriddenBy: (layer: string) => string;
  editDescription: string;
  writeLayer: string;
  lock: string;
  lockHint: string;
  save: string;
  cancel: string;
  clearLayer: (layer: string) => string;
  invalidJson: string;
  changeInRepo: string;
  changeInRepoLabel: (key: string) => string;
  changeInRepoTitle: (key: string) => string;
  changeInRepoDescription: string;
  openPullRequest: string;
  pullRequestOpened: string;
  /** The host returned the change to commit, but opened no pull request. */
  proposalSnippet: string;
  /** The subtitle for a tenant admin's slice. */
  tenantSlice: string;
  /** The subtitle for a person's own slice. */
  personSlice: string;
  propose: string;
  proposeLabel: (key: string) => string;
  proposeTitle: (key: string) => string;
  proposeDescription: string;
  proposeReason: string;
  sendProposal: string;
  proposalSent: string;
  proposalsTitle: string;
  myProposalsTitle: string;
  proposalBy: (who: string, when: string) => string;
  proposalStatus: Record<SettingsProposalEntry["status"], string>;
  approve: string;
  approveLabel: (key: string) => string;
  decline: string;
  declineLabel: (key: string) => string;
  readOnly: string;
  healthEmpty: string;
  healthEmptyDescription: string;
  levels: Record<SettingsFindingLevel, string>;
  fix: string;
  fixLabel: (rule: string) => string;
  /** The Health tab's count, for a screen reader. */
  findingsCount: (n: number) => string;
  howToFix: string;
  openStep: string;
  runInTerminal: string;
  planTitle: (fixId: string) => string;
  planLoading: string;
  planFiles: string;
  planCommands: string;
  planSecrets: string;
  planManual: string;
  planNeeds: string;
  apply: string;
  confirmTitle: string;
  confirmBody: (files: number, commands: number) => string;
  confirmApply: string;
  applied: string;
  appliedUnverified: string;
  stalePlan: string;
  planAgain: string;
  secretsEmpty: string;
  secretStatus: Record<SettingsSecretStatus["status"], string>;
  secretStores: Record<SettingsSecretStatus["store"], string>;
  neededBy: (keys: string) => string;
  lastRotated: (when: string) => string;
  secretHint: string;
  setSecret: string;
  rotateSecret: string;
  secretLabel: (name: string) => string;
  setSecretTitle: (name: string) => string;
  setSecretDescription: string;
  secretValue: string;
  upgradesEmpty: string;
  checkAgain: string;
  checkedAt: (when: string) => string;
  offline: string;
  distance: Record<UpgradeDistance, string>;
  advisory: string;
  releaseNotes: string;
  openUpgradePr: string;
  auditEmpty: string;
  loadMore: string;
  auditActions: Record<SettingsAuditEntry["action"], string>;
  /** How a time is shown. Default: the browser's locale. */
  formatTime: (iso: string) => string;
}

/** The default copy. @stability Beta */
export const GENESIS_SETTINGS_COPY: GenesisSettingsCopy = {
  title: "Genesis settings",
  description: "Every setting, where its value comes from, and what needs attention.",
  refresh: "Refresh",
  loading: "Loading settings…",
  loadFailed: "The settings couldn't be loaded.",
  retry: "Try again",
  tabs: { values: "Values", health: "Health", secrets: "Secrets", upgrades: "Upgrades", audit: "Audit" },
  layers: { default: "Default", preset: "Preset", file: "File", database: "Database", tenant: "Tenant", person: "Person" },
  filterLabel: "Filter settings",
  filterPlaceholder: "Filter by key or description",
  noMatches: "No settings match.",
  notSet: "Not set",
  on: "On",
  off: "Off",
  lockedBy: (layer) => `Locked by ${layer}`,
  buildOnly: "Build",
  edit: "Edit",
  editLabel: (key) => `Edit ${key}`,
  editTitle: (key) => `Edit ${key}`,
  editDescription: "A later layer wins unless an earlier one locked the value.",
  overriddenBy: (layer) => `${layer} overrides this layer, so the change won't show until that value is cleared.`,
  writeLayer: "Save in",
  lock: "Lock",
  lockHint: "Later layers can't change a locked value.",
  save: "Save",
  cancel: "Cancel",
  clearLayer: (layer) => `Clear the ${layer} value`,
  invalidJson: "That isn't valid JSON.",
  changeInRepo: "Change in repo",
  changeInRepoLabel: (key) => `Change ${key} in the repo`,
  changeInRepoTitle: (key) => `Change ${key} in the repo`,
  changeInRepoDescription: "This key is set in genesis.config.json and reviewed like code. Commit this change:",
  openPullRequest: "Open pull request",
  pullRequestOpened: "Pull request opened.",
  proposalSnippet: "No pull request was opened. Commit this change:",
  tenantSlice: "Your organization's settings.",
  personSlice: "Your own settings.",
  propose: "Propose…",
  proposeLabel: (key) => `Propose a change to ${key}`,
  proposeTitle: (key) => `Propose a change to ${key}`,
  proposeDescription: "The app has locked this value. A platform admin will approve or decline your proposal.",
  proposeReason: "Why",
  sendProposal: "Send proposal",
  proposalSent: "Proposal sent. A platform admin will decide.",
  proposalsTitle: "Proposals waiting for a decision",
  myProposalsTitle: "Your proposals",
  proposalBy: (who, when) => `${who} · ${when}`,
  proposalStatus: { pending: "Waiting", approved: "Approved", declined: "Declined" },
  approve: "Approve",
  approveLabel: (key) => `Approve the proposal for ${key}`,
  decline: "Decline",
  declineLabel: (key) => `Decline the proposal for ${key}`,
  readOnly: "Read-only here",
  healthEmpty: "Nothing needs attention",
  healthEmptyDescription: "The doctor found no problems.",
  levels: { error: "Error", warn: "Warning", info: "Info" },
  fix: "Fix…",
  fixLabel: (rule) => `Fix ${rule}`,
  findingsCount: (n) => ` (${n} ${n === 1 ? "finding" : "findings"})`,
  howToFix: "How to fix",
  openStep: "Open step",
  runInTerminal: "Run in a terminal:",
  planTitle: (fixId) => `Fix ${fixId}`,
  planLoading: "Planning…",
  planFiles: "Files it writes",
  planCommands: "Commands it runs",
  planSecrets: "Secrets it needs",
  planManual: "Then, by hand",
  planNeeds: "This host can't apply this fix. Run it from the CLI instead:",
  apply: "Apply…",
  confirmTitle: "Apply this fix?",
  confirmBody: (files, commands) =>
    `It writes ${files} ${files === 1 ? "file" : "files"} and runs ${commands} ${commands === 1 ? "command" : "commands"}.`,
  confirmApply: "Apply",
  applied: "Applied and verified.",
  appliedUnverified: "Applied, but its check hasn't passed yet.",
  stalePlan: "Something changed since this plan was made.",
  planAgain: "Plan again",
  secretsEmpty: "No setting needs a secret.",
  secretStatus: { set: "Set", missing: "Missing", unknown: "Unknown" },
  secretStores: { vault: "Vault", edge: "Edge Function secret", "server-env": "Server environment", ci: "CI secret" },
  neededBy: (keys) => `Needed by ${keys}`,
  lastRotated: (when) => `Last set ${when}`,
  secretHint: "Set secrets from a terminal with genesis fix secrets.set. Their values never reach this screen.",
  setSecret: "Set…",
  rotateSecret: "Rotate…",
  secretLabel: (name) => `Set ${name}`,
  setSecretTitle: (name) => `Set ${name}`,
  setSecretDescription: "The value goes straight to the Vault. It is never shown again, here or anywhere.",
  secretValue: "Value",
  upgradesEmpty: "No release information yet.",
  checkAgain: "Check again",
  checkedAt: (when) => `Checked ${when}`,
  offline: "Offline: showing the last check.",
  distance: { current: "Up to date", patch: "Patch behind", minor: "Minor behind", major: "Major behind", unknown: "Unknown" },
  advisory: "Advisory",
  releaseNotes: "Release notes",
  openUpgradePr: "Open upgrade PR…",
  auditEmpty: "No changes yet.",
  loadMore: "Load more",
  auditActions: { set: "Set", clear: "Cleared", fix: "Fixed", upgrade: "Upgraded", secret: "Secret changed" },
  formatTime: (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  },
};

/** @stability Beta */
export interface GenesisSettingsProps {
  client: SettingsClient;
  /**
   * What this mount may do. It narrows what the host reports and can never widen it: the app's
   * platform screen passes `APP_HOST_CAPABILITIES` so a misconfigured host still shows database
   * writes only. Default: the host's own.
   */
  capabilities?: Partial<SettingsCapabilities>;
  copy?: Partial<GenesisSettingsCopy>;
  /**
   * The tenant whose settings to show, for a tenant admin: the host answers with that tenant's
   * slice when the signed-in person administers it. Without it, a platform admin sees everything
   * and anyone else their own person settings.
   */
  tenant?: string;
  defaultTab?: GenesisSettingsTab;
  /** Opens a guided fix's setup step (the wizard routes to it). Without it, a step shows its CLI command. */
  onOpenStep?: (step: string) => void;
  /** Audit entries per page. Default 25. */
  auditPageSize?: number;
  /**
   * Draw the page header (title, description, Refresh). Default true; pass false when the host page
   * owns the title (under `AppShellPageHeader`, say).
   */
  header?: boolean;
  /** Prefix of every test id. Default `genesis-settings`. */
  testID?: string;
  className?: string;
}

type Copy = GenesisSettingsCopy;

const LEVEL_ORDER: Record<SettingsFindingLevel, number> = { error: 0, warn: 1, info: 2 };
const LEVEL_VARIANT = { error: "destructive", warn: "warning", info: "info" } as const;
const SECRET_VARIANT = { set: "success", missing: "destructive", unknown: "muted" } as const;
const DISTANCE_VARIANT = { current: "success", patch: "info", minor: "warning", major: "warning", unknown: "muted" } as const;

/** A test id from parts: anything but letters, digits, dots, underscores and dashes becomes a dash. */
function tid(...parts: string[]): string {
  return parts.map((p) => p.replace(/[^a-zA-Z0-9._-]+/g, "-")).join("-");
}

/** A layer's name, or the layer itself when a host sends one this screen doesn't know. */
function layerLabel(copy: Copy, layer: string): string {
  return (copy.layers as Record<string, string | undefined>)[layer] ?? layer;
}

function formatValue(value: unknown, copy: Copy): string {
  if (value === null || value === undefined) return copy.notSet;
  if (value === true) return copy.on;
  if (value === false) return copy.off;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "[]";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{children}</code>;
}

/**
 * The Settings screen. See the module header.
 *
 * ```tsx
 * const client = createSettingsClient(fetch, { baseUrl: "/api/genesis/settings", token: () => session.access_token });
 * <GenesisSettings client={client} capabilities={APP_HOST_CAPABILITIES} />
 * ```
 *
 * @stability Beta
 */
export function GenesisSettings({
  client,
  capabilities: narrow,
  copy: copyOverride,
  tenant,
  defaultTab = "values",
  onOpenStep,
  auditPageSize = 25,
  header = true,
  testID = "genesis-settings",
  className,
}: GenesisSettingsProps) {
  const copy = useMemo<Copy>(() => ({ ...GENESIS_SETTINGS_COPY, ...copyOverride }), [copyOverride]);
  const [state, setState] = useState<SettingsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<GenesisSettingsTab>(defaultTab);

  // Only the latest load's answer is used: an older one that arrives late never overwrites it.
  const loads = useRef(0);
  const load = useCallback(async () => {
    const mine = ++loads.current;
    setLoading(true);
    try {
      const next = await client.state({ auditLimit: auditPageSize, ...(tenant !== undefined ? { tenant } : {}) });
      if (mine !== loads.current) return;
      setState(next);
      setLoadError(null);
    } catch (error) {
      if (mine === loads.current) setLoadError(errorMessage(error));
    } finally {
      if (mine === loads.current) setLoading(false);
    }
  }, [client, auditPageSize, tenant]);

  useEffect(() => {
    void load();
  }, [load]);

  const caps = useMemo(() => (state ? intersectCapabilities(state.capabilities, narrow) : null), [state, narrow]);
  // A tenant admin or a person sees their own slice: Values and Audit.
  const scoped = state?.viewer !== undefined && state.viewer.scope !== "platform";
  const tabs: readonly GenesisSettingsTab[] = scoped ? ["values", "audit"] : ["values", "health", "secrets", "upgrades", "audit"];
  const subtitle = state?.viewer?.scope === "tenant" ? copy.tenantSlice : state?.viewer?.scope === "person" ? copy.personSlice : copy.description;

  const refresh = (
    <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} testID={tid(testID, "refresh")}>
      {copy.refresh}
    </Button>
  );

  return (
    <div data-slot="genesis-settings" data-testid={testID} className={["flex flex-col gap-6", className].filter(Boolean).join(" ")}>
      {header ? (
        <PageHeader
          title={copy.title}
          subtitle={state ? `${state.app.name} · ${subtitle}` : subtitle}
          actions={refresh}
        />
      ) : (
        <div className="flex justify-end">{refresh}</div>
      )}

      {loadError ? (
        <InlineAlert
          variant="destructive"
          title={copy.loadFailed}
          description={loadError}
          testID={tid(testID, "load-error")}
          actions={
            <Button size="sm" variant="outline" onClick={() => void load()} testID={tid(testID, "retry")}>
              {copy.retry}
            </Button>
          }
        />
      ) : null}

      {!state || !caps ? (
        loading ? <PageLoading label={copy.loading} testID={tid(testID, "loading")} /> : null
      ) : (
        <Tabs value={tabs.includes(tab) ? tab : "values"} onValueChange={(v) => setTab(v as GenesisSettingsTab)} defaultValue={defaultTab}>
          <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:thin]">
            {tabs.map((t) => (
              <TabsTrigger key={t} value={t} data-testid={tid(testID, "tab", t)}>
                {copy.tabs[t]}
                {t === "health" && state.findings.length ? (
                  <>
                    <Badge variant={state.findings.some((f) => f.level === "error") ? "destructive" : "muted"} className="ml-1.5" aria-hidden>
                      {state.findings.length}
                    </Badge>
                    <span className="sr-only" data-testid={tid(testID, "health-count")}>
                      {copy.findingsCount(state.findings.length)}
                    </span>
                  </>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="values" className="pt-4">
            <ValuesTab state={state} caps={caps} client={client} copy={copy} testID={testID} onChanged={load} tenant={tenant} />
          </TabsContent>
          {scoped ? null : (
            <>
              <TabsContent value="health" className="pt-4">
                <HealthTab state={state} caps={caps} client={client} copy={copy} testID={testID} onChanged={load} onOpenStep={onOpenStep} />
              </TabsContent>
              <TabsContent value="secrets" className="pt-4">
                <SecretsTab secrets={state.secrets} caps={caps} client={client} copy={copy} testID={testID} onChanged={load} />
              </TabsContent>
              <TabsContent value="upgrades" className="pt-4">
                <UpgradesTab initial={state.upgrades} caps={caps} client={client} copy={copy} testID={testID} onChanged={load} />
              </TabsContent>
            </>
          )}
          <TabsContent value="audit" className="pt-4">
            <AuditTab state={state} client={client} copy={copy} testID={testID} pageSize={auditPageSize} tenant={tenant} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

interface TabProps {
  caps: SettingsCapabilities;
  client: SettingsClient;
  copy: Copy;
  testID: string;
  onChanged: () => Promise<void>;
  /** A sheet's `onCloseAutoFocus`: focus goes back to the button that opened it. */
  returnFocus?: (event: Event) => void;
}

/**
 * Focus back to the opener when a sheet closes. The sheets open from state, not a Radix trigger,
 * so Radix has no trigger to return focus to: remember the button (`remember(event.currentTarget)`)
 * and pass `returnFocus` as the sheet's `onCloseAutoFocus`.
 */
function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  const remember = useCallback((el: HTMLElement | null) => {
    opener.current = el;
  }, []);
  const returnFocus = useCallback((event: Event) => {
    const el = opener.current;
    if (el && el.isConnected) {
      event.preventDefault();
      el.focus();
    }
  }, []);
  return { remember, returnFocus };
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

type Editing = { def: SettingDef; mode: "edit" | "repo" | "propose"; nonce: number };

/** The keys a viewer's slice holds: every key for the platform, else the keys of their scope. */
function inSlice(def: SettingDef, viewer: SettingsViewer | undefined): boolean {
  return !viewer || viewer.scope === "platform" || def.scope === viewer.scope;
}

function ValuesTab({ state, caps, client, copy, testID, onChanged, tenant }: TabProps & { state: SettingsState; tenant: string | undefined }) {
  const [filter, setFilter] = useState("");
  // The sheet stays mounted and opens and closes, so Radix returns focus to the button that opened it.
  const [editing, setEditing] = useState<Editing | null>(null);
  const [open, setOpen] = useState(false);
  const { remember, returnFocus } = useReturnFocus();
  const filterId = useId();
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const byNs = new Map<string, SettingDef[]>();
    for (const def of [...state.catalogue].sort((a, b) => a.key.localeCompare(b.key))) {
      if (!inSlice(def, state.viewer)) continue;
      if (q && !def.key.toLowerCase().includes(q) && !(def.summary ?? "").toLowerCase().includes(q)) continue;
      byNs.set(def.namespace, [...(byNs.get(def.namespace) ?? []), def]);
    }
    return [...byNs.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [state.catalogue, state.viewer, filter]);

  return (
    <div className="flex flex-col gap-6">
      <ProposalsSection state={state} caps={caps} client={client} copy={copy} testID={testID} onChanged={onChanged} />
      <div className="flex max-w-sm flex-col gap-1.5">
        <Label htmlFor={filterId}>{copy.filterLabel}</Label>
        <Input
          id={filterId}
          type="search"
          value={filter}
          placeholder={copy.filterPlaceholder}
          onChange={(e) => setFilter(e.target.value)}
          data-testid={tid(testID, "filter")}
        />
      </div>
      {groups.length === 0 ? <EmptyState title={copy.noMatches} /> : null}
      {groups.map(([namespace, defs]) => (
        <Section key={namespace} title={namespace} testID={tid(testID, "namespace", namespace)}>
          <div className="divide-y">
            {defs.map((def) => (
              <ValueRow
                key={def.key}
                def={def}
                value={state.resolved.values[def.key]}
                source={state.resolved.sources[def.key]}
                caps={caps}
                viewer={state.viewer}
                canPropose={caps.proposeChanges === true}
                copy={copy}
                testID={testID}
                onEdit={(mode, opener) => {
                  remember(opener);
                  setEditing((prev) => ({ def, mode, nonce: (prev?.nonce ?? 0) + 1 }));
                  setOpen(true);
                }}
              />
            ))}
          </div>
        </Section>
      ))}
      <ValueSheet
        returnFocus={returnFocus}
        open={open}
        editing={editing}
        state={state}
        caps={caps}
        client={client}
        copy={copy}
        testID={testID}
        tenant={tenant}
        onClose={() => setOpen(false)}
        onChanged={onChanged}
      />
    </div>
  );
}

/**
 * Proposals: a platform admin approves or declines each pending one (when the host can decide);
 * anyone else sees how their own were decided.
 */
function ProposalsSection({ state, caps, client, copy, testID, onChanged }: TabProps & { state: SettingsState }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const proposals = state.proposals ?? [];
  const platform = !state.viewer || state.viewer.scope === "platform";
  const shown = platform ? proposals.filter((p) => p.status === "pending") : proposals;
  if (!shown.length) return null;
  const canDecide = platform && caps.writeDatabase && typeof client.decideProposal === "function";
  const decide = async (p: SettingsProposalEntry, approve: boolean) => {
    if (!client.decideProposal) return;
    setBusy(p.id);
    setError(null);
    try {
      await client.decideProposal({ id: p.id, approve });
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const def = (key: string) => state.catalogue.find((d) => d.key === key);
  return (
    <Section title={platform ? copy.proposalsTitle : copy.myProposalsTitle} testID={tid(testID, "proposals")}>
      {error ? <InlineAlert variant="destructive" description={error} testID={tid(testID, "proposals-error")} /> : null}
      <div className="divide-y">
        {shown.map((p) => {
          const rowId = tid(testID, "proposal", p.id);
          return (
            <SettingsRow
              key={p.id}
              testID={rowId}
              label={
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="break-all font-mono text-sm">{p.key}</span>
                  <span className="text-sm" data-testid={tid(rowId, "value")}>
                    → {formatValue(p.value, copy)}
                  </span>
                  {p.locked ? <Lock aria-label={copy.lock} className="size-3" /> : null}
                </span>
              }
              description={
                <span className="flex flex-col gap-0.5">
                  {p.reason ? <span className="whitespace-pre-wrap" data-testid={tid(rowId, "reason")}>{p.reason}</span> : null}
                  <span>{copy.proposalBy(p.proposedBy ?? "", copy.formatTime(p.proposedAt))}</span>
                  {def(p.key)?.summary ? <span>{def(p.key)!.summary}</span> : null}
                </span>
              }
            >
              {canDecide && p.status === "pending" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => void decide(p, false)} disabled={busy !== null} aria-label={copy.declineLabel(p.key)} testID={tid(rowId, "decline")}>
                    {copy.decline}
                  </Button>
                  <Button size="sm" onClick={() => void decide(p, true)} disabled={busy !== null} aria-label={copy.approveLabel(p.key)} testID={tid(rowId, "approve")}>
                    {copy.approve}
                  </Button>
                </>
              ) : (
                <Badge variant={p.status === "approved" ? "success" : p.status === "declined" ? "muted" : "info"} data-testid={tid(rowId, "status")}>
                  {copy.proposalStatus[p.status] ?? p.status}
                </Badge>
              )}
            </SettingsRow>
          );
        })}
      </div>
    </Section>
  );
}

function ValueRow({
  def,
  value,
  source,
  caps,
  viewer,
  canPropose,
  copy,
  testID,
  onEdit,
}: {
  def: SettingDef;
  value: unknown;
  source: SettingSource | undefined;
  caps: SettingsCapabilities;
  viewer: SettingsViewer | undefined;
  canPropose: boolean;
  copy: Copy;
  testID: string;
  onEdit: (mode: Editing["mode"], opener: HTMLElement) => void;
}) {
  const writable = settingWritability(def, source, caps, viewer);
  // A tenant admin or a person can't change a value the app locked in its database: they propose it.
  const proposable = canPropose && viewer !== undefined && viewer.scope !== "platform" && !writable.layers.length && source?.lockedBy === "database";
  // A key only the repo can change here (a build key, or one the file layer locked) on a host that
  // can't write files: it changes through a pull request or by hand.
  const repoOnly = !writable.layers.length && writable.refused.file === "capability" && (def.applies === "build" || source?.lockedBy === "file");
  const rowId = tid(testID, "row", def.key);
  return (
    <SettingsRow
      testID={rowId}
      label={<span className="break-all font-mono text-sm">{def.key}</span>}
      description={
        <span className="flex flex-col gap-1.5">
          {def.summary ? <span>{def.summary}</span> : null}
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" data-testid={tid(rowId, "source")} data-layer={source?.layer}>
              {layerLabel(copy, source?.layer ?? "default")}
            </Badge>
            {source?.lockedBy ? (
              <Badge variant="warning" data-testid={tid(rowId, "lock")} data-layer={source.lockedBy}>
                <Lock aria-hidden className="mr-1 size-3" />
                {copy.lockedBy(layerLabel(copy, source.lockedBy))}
              </Badge>
            ) : null}
            {def.applies === "build" ? <Badge variant="muted">{copy.buildOnly}</Badge> : null}
            <span className="min-w-0 break-all text-foreground sm:hidden" data-testid={tid(rowId, "value-narrow")}>
              {formatValue(value, copy)}
            </span>
          </span>
        </span>
      }
    >
      <span className="hidden max-w-[16rem] truncate text-sm text-foreground sm:inline" data-testid={tid(rowId, "value")} title={formatValue(value, copy)}>
        {formatValue(value, copy)}
      </span>
      {writable.layers.length ? (
        <Button variant="outline" size="sm" onClick={(e) => onEdit("edit", e.currentTarget)} aria-label={copy.editLabel(def.key)} testID={tid(rowId, "edit")}>
          {copy.edit}
        </Button>
      ) : proposable ? (
        <Button variant="outline" size="sm" onClick={(e) => onEdit("propose", e.currentTarget)} testID={tid(rowId, "propose")} aria-label={copy.proposeLabel(def.key)}>
          {copy.propose}
        </Button>
      ) : repoOnly ? (
        <Button variant="ghost" size="sm" onClick={(e) => onEdit("repo", e.currentTarget)} testID={tid(rowId, "repo")} aria-label={copy.changeInRepoLabel(def.key)}>
          {copy.changeInRepo}
        </Button>
      ) : !source?.lockedBy ? (
        <span className="sr-only">{copy.readOnly}</span>
      ) : null}
    </SettingsRow>
  );
}

/** The control for one value. List and object values are edited as JSON. */
function ValueInput({
  def,
  draft,
  onDraft,
  id,
  copy,
  testID,
  problemId,
}: {
  def: SettingDef;
  draft: string;
  onDraft: (next: string) => void;
  id: string;
  copy: Copy;
  testID: string;
  /** The id of the problem message, while there is one. */
  problemId: string | undefined;
}) {
  // A value that doesn't fit is announced with its problem.
  const a11y = problemId ? { "aria-invalid": true as const, "aria-describedby": problemId } : {};
  if (def.type === "boolean") {
    return (
      <div className="flex items-center gap-3">
        <Switch id={id} checked={draft === "true"} onCheckedChange={(on) => onDraft(on ? "true" : "false")} data-testid={tid(testID, "input")} {...a11y} />
        <Label htmlFor={id}>{draft === "true" ? copy.on : copy.off}</Label>
      </div>
    );
  }
  if (def.options && (def.type === "string" || def.type === "number")) {
    return (
      <Select value={draft} onValueChange={onDraft}>
        <SelectTrigger id={id} data-testid={tid(testID, "input")} {...a11y}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {def.options.map((o) => (
            <SelectItem key={String(o)} value={String(o)}>
              {String(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (def.type === "list" || def.type === "object") {
    return <Textarea id={id} value={draft} onChange={(e) => onDraft(e.target.value)} rows={5} className="font-mono text-sm" data-testid={tid(testID, "input")} {...a11y} />;
  }
  return (
    <Input
      id={id}
      type={def.type === "number" ? "number" : "text"}
      value={draft}
      onChange={(e) => onDraft(e.target.value)}
      {...(def.min !== undefined ? { min: def.min } : {})}
      {...(def.max !== undefined ? { max: def.max } : {})}
      data-testid={tid(testID, "input")}
      {...a11y}
    />
  );
}

function toDraft(def: SettingDef, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (def.type === "list" || def.type === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

/** The draft as a value, or why it can't be one. */
function fromDraft(def: SettingDef, draft: string, copy: Copy): { value: unknown } | { problem: string } {
  let value: unknown;
  if (draft.trim() === "" && def.nullable && def.type !== "boolean") value = null;
  else if (def.type === "boolean") value = draft === "true";
  else if (def.type === "number") value = draft.trim() === "" ? Number.NaN : Number(draft);
  else if (def.type === "list" || def.type === "object") {
    try {
      value = JSON.parse(draft);
    } catch {
      return { problem: copy.invalidJson };
    }
  } else value = draft;
  const problem = settingValueProblem(def, value);
  return problem ? { problem } : { value };
}

/** The edit sheet. Its body is keyed on the key and mode, so each opening starts from the current value. */
function ValueSheet({ open, ...props }: TabProps & { open: boolean; editing: Editing | null; state: SettingsState; tenant: string | undefined; onClose: () => void }) {
  return (
    <Sheet open={open && props.editing !== null} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      {props.editing ? <ValueSheetBody key={props.editing.nonce} {...props} editing={props.editing} /> : null}
    </Sheet>
  );
}

function ValueSheetBody({
  returnFocus,
  editing,
  state,
  caps,
  client,
  copy,
  testID,
  tenant,
  onClose,
  onChanged,
}: TabProps & { editing: Editing; state: SettingsState; tenant: string | undefined; onClose: () => void }) {
  const def = editing.def;
  const source = state.resolved.sources[def.key];
  const writable = settingWritability(def, source, caps, state.viewer);
  // The database when the value already comes from there; else the file layer when the host can
  // write it (reviewed like code), the database being an explicit choice.
  const preferred = preferredWriteLayer(writable, source);
  const lockedIn = (l: SettingsWriteLayer | undefined) => (l ? state.layers[l]?.[def.key]?.locked === true : source?.lockedBy === "file");
  const [layer, setLayerState] = useState<SettingsWriteLayer | undefined>(preferred);
  const [draft, setDraft] = useState(() => toDraft(def, state.resolved.values[def.key]));
  const [locked, setLocked] = useState(() => lockedIn(preferred));
  // The lock box shows the chosen layer's own lock.
  const setLayer = (l: SettingsWriteLayer) => {
    setLayerState(l);
    setLocked(lockedIn(l));
  };
  // Writing below the layer the value comes from changes nothing until that value goes.
  const overriddenBy =
    !editing || editing.mode !== "edit" || !layer || !source || SETTINGS_LAYERS.indexOf(source.layer) <= SETTINGS_LAYERS.indexOf(layer) ? null : source.layer;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ url?: string; snippet?: string; sent?: boolean } | null>(null);
  const [reason, setReason] = useState("");
  // Only the app's own layers (file, database) hold a lock.
  const lockable = layer === "file" || layer === "database";
  const layerTenant = layer === "tenant" ? tenant : undefined;
  const baseId = useId();
  const sheetId = tid(testID, "value-sheet");

  const parsed = fromDraft(def, draft, copy);
  const problem = "problem" in parsed ? parsed.problem : null;
  const layerHas = layer ? Object.prototype.hasOwnProperty.call(state.layers[layer] ?? {}, def.key) : false;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!layer || "problem" in parsed) return;
      await client.setValue({ key: def.key, value: parsed.value, layer, ...(lockable ? { locked } : {}), ...(layerTenant !== undefined ? { tenant: layerTenant } : {}) });
      onClose();
      await onChanged();
    });
  const clear = () =>
    run(async () => {
      if (!layer) return;
      await client.clearValue({ key: def.key, layer, ...(layerTenant !== undefined ? { tenant: layerTenant } : {}) });
      onClose();
      await onChanged();
    });
  const propose = () =>
    run(async () => {
      if ("problem" in parsed) return;
      const asking = editing.mode === "propose";
      const result = await client.propose({
        key: def.key,
        value: parsed.value,
        ...(asking ? {} : { locked }),
        ...(asking && reason.trim() ? { reason: reason.trim() } : {}),
        ...(asking && tenant !== undefined ? { tenant } : {}),
      });
      if (asking) {
        setProposal({ sent: true });
        await onChanged();
        return;
      }
      setProposal({ ...(result.pullRequestUrl ? { url: result.pullRequestUrl } : {}), ...(result.snippet !== undefined ? { snippet: result.snippet } : {}) });
    });

  const repo = editing.mode === "repo";
  const asking = editing.mode === "propose";
  const inputId = `${baseId}-value`;
  return (
    <>
      <SheetContent data-testid={sheetId} className="flex flex-col gap-4 sm:max-w-lg" onCloseAutoFocus={returnFocus}>
        <SheetHeader>
          <SheetTitle>{repo ? copy.changeInRepoTitle(def.key) : asking ? copy.proposeTitle(def.key) : copy.editTitle(def.key)}</SheetTitle>
          <SheetDescription>{repo ? copy.changeInRepoDescription : asking ? copy.proposeDescription : def.summary ?? copy.editDescription}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>{def.key}</Label>
            <ValueInput def={def} draft={draft} onDraft={setDraft} id={inputId} copy={copy} testID={sheetId} problemId={problem ? `${baseId}-problem` : undefined} />
            {problem ? (
              <p id={`${baseId}-problem`} className="text-sm text-destructive" role="alert" data-testid={tid(sheetId, "problem")}>
                {problem}
              </p>
            ) : null}
          </div>
          {!repo && !asking && writable.layers.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" id={`${baseId}-layer`}>
                {copy.writeLayer}
              </span>
              <RadioGroup aria-labelledby={`${baseId}-layer`} value={layer} onValueChange={(v) => setLayer(v as SettingsWriteLayer)} className="flex gap-4">
                {writable.layers.map((l) => (
                  <div key={l} className="flex items-center gap-2">
                    <RadioGroupItem id={`${baseId}-layer-${l}`} value={l} data-testid={tid(sheetId, "layer", l)} />
                    <Label htmlFor={`${baseId}-layer-${l}`}>{layerLabel(copy, l)}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : null}
          {asking ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${baseId}-reason`}>{copy.proposeReason}</Label>
              <Textarea id={`${baseId}-reason`} value={reason} maxLength={1000} rows={3} onChange={(e) => setReason(e.target.value)} data-testid={tid(sheetId, "reason")} />
            </div>
          ) : repo || lockable ? (
            <div className="flex items-start gap-2">
              <Checkbox id={`${baseId}-lock`} checked={locked} onCheckedChange={(c) => setLocked(c === true)} data-testid={tid(sheetId, "lock")} />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`${baseId}-lock`}>{copy.lock}</Label>
                <span className="text-xs text-muted-foreground">{copy.lockHint}</span>
              </div>
            </div>
          ) : null}
          {overriddenBy ? (
            <InlineAlert variant="info" description={copy.overriddenBy(layerLabel(copy, overriddenBy))} testID={tid(sheetId, "overridden")} />
          ) : null}
          {repo ? (
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs" data-testid={tid(sheetId, "snippet")}>
              {settingFileSnippet(def.key, "value" in parsed ? parsed.value : draft, locked)}
            </pre>
          ) : null}
          {proposal ? (
            proposal.sent ? (
              <InlineAlert variant="success" title={copy.proposalSent} testID={tid(sheetId, "proposal")} />
            ) : proposal.url ? (
              <InlineAlert variant="success" title={copy.pullRequestOpened} description={proposal.url} testID={tid(sheetId, "proposal")} />
            ) : (
              <InlineAlert variant="info" title={copy.proposalSnippet} description={proposal.snippet} testID={tid(sheetId, "proposal")} />
            )
          ) : null}
          {error ? <InlineAlert variant="destructive" description={error} testID={tid(sheetId, "error")} /> : null}
        </div>
        <SheetFooter className="mt-auto flex-col gap-2 sm:flex-row sm:justify-end">
          {!repo && !asking && layer && layerHas ? (
            <Button variant="ghost" onClick={() => void clear()} disabled={busy} testID={tid(sheetId, "clear")}>
              {copy.clearLayer(layerLabel(copy, layer))}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose} testID={tid(sheetId, "cancel")}>
            {copy.cancel}
          </Button>
          {asking ? (
            <Button onClick={() => void propose()} disabled={busy || problem !== null || proposal?.sent === true} testID={tid(sheetId, "send")}>
              {copy.sendProposal}
            </Button>
          ) : repo ? (
            caps.proposeChanges ? (
              <Button onClick={() => void propose()} disabled={busy || problem !== null} testID={tid(sheetId, "propose")}>
                {copy.openPullRequest}
              </Button>
            ) : null
          ) : (
            <Button onClick={() => void save()} disabled={busy || problem !== null || !layer} testID={tid(sheetId, "save")}>
              {copy.save}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </>
  );
}

// ---------------------------------------------------------------------------
// Health and fixes
// ---------------------------------------------------------------------------

/**
 * Whether this host can plan and apply an automatic fix at all: the CLI host can; the app host
 * only a fix that writes the database layer and nothing else.
 */
function canAutoFix(caps: SettingsCapabilities, fix: SettingsFixRef): boolean {
  return caps.writeFiles || caps.runCli || (fix.databaseOnly === true && caps.writeDatabase);
}

function HealthTab({
  state,
  caps,
  client,
  copy,
  testID,
  onChanged,
  onOpenStep,
}: TabProps & { state: SettingsState; onOpenStep: ((step: string) => void) | undefined }) {
  const [fixing, setFixing] = useState<string | null>(null);
  const { remember, returnFocus } = useReturnFocus();
  const findings = useMemo(() => [...state.findings].sort((a, b) => (LEVEL_ORDER[a.level] ?? 3) - (LEVEL_ORDER[b.level] ?? 3)), [state.findings]);
  if (!findings.length) return <EmptyState title={copy.healthEmpty} description={copy.healthEmptyDescription} />;
  return (
    <>
      <div className="divide-y">
        {findings.map((f) => (
          <FindingRow key={f.id} finding={f} caps={caps} copy={copy} testID={testID} onFix={(id, opener) => {
              remember(opener);
              setFixing(id);
            }}
            onOpenStep={onOpenStep} />
        ))}
      </div>
      <PlanSheet fixId={fixing} caps={caps} client={client} copy={copy} testID={testID} onClose={() => setFixing(null)} onChanged={onChanged} returnFocus={returnFocus} />
    </>
  );
}

function FindingRow({
  finding,
  caps,
  copy,
  testID,
  onFix,
  onOpenStep,
}: {
  finding: SettingsFinding;
  caps: SettingsCapabilities;
  copy: Copy;
  testID: string;
  onFix: (fixId: string, opener: HTMLElement) => void;
  onOpenStep: ((step: string) => void) | undefined;
}) {
  const fix = finding.fix;
  const href = safeHref(fix?.href);
  const rowId = tid(testID, "finding", finding.id);
  const where = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : null;
  return (
    <SettingsRow
      testID={rowId}
      label={<span className="whitespace-normal leading-snug">{finding.message}</span>}
      description={
        <span className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant={LEVEL_VARIANT[finding.level] ?? "muted"}>{copy.levels[finding.level] ?? finding.level}</Badge>
            <Code>{finding.rule}</Code>
            {where ? <span className="break-all">{where}</span> : null}
          </span>
          {fix ? <FixHint fix={fix} caps={caps} copy={copy} testID={rowId} onOpenStep={onOpenStep} /> : null}
        </span>
      }
    >
      {fix?.kind === "auto" && canAutoFix(caps, fix) ? (
        <Button size="sm" onClick={(e) => onFix(fix.id, e.currentTarget)} testID={tid(rowId, "fix")} aria-label={copy.fixLabel(finding.rule)}>
          {copy.fix}
        </Button>
      ) : fix?.kind === "guided" && (href || (onOpenStep && fix.step)) ? (
        href ? (
          <Button size="sm" variant="outline" asChild>
            <a href={href} data-testid={tid(rowId, "step")}>
              {copy.openStep}
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onOpenStep?.(fix.step!)} testID={tid(rowId, "step")}>
            {copy.openStep}
          </Button>
        )
      ) : null}
    </SettingsRow>
  );
}

/** The part of a fix shown under the finding: the CLI command when the screen can't act, or the instructions. */
function FixHint({
  fix,
  caps,
  copy,
  testID,
  onOpenStep,
}: {
  fix: SettingsFixRef;
  caps: SettingsCapabilities;
  copy: Copy;
  testID: string;
  onOpenStep: ((step: string) => void) | undefined;
}) {
  if (fix.kind === "auto" && !canAutoFix(caps, fix)) {
    return (
      <span data-testid={tid(testID, "cli")}>
        {copy.runInTerminal} <Code>genesis fix {fix.id}</Code>
      </span>
    );
  }
  if (fix.kind === "guided" && !safeHref(fix.href) && !(onOpenStep && fix.step)) {
    return (
      <span data-testid={tid(testID, "cli")}>
        {/* A guided fix with a step opens in the setup wizard; without one, the CLI's fix, which asks at a terminal. */}
        {copy.runInTerminal} <Code>{fix.step ? `genesis setup --step ${fix.step}` : `genesis fix ${fix.id}`}</Code>
      </span>
    );
  }
  if (fix.kind === "manual" && fix.instructions) {
    return (
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="link" size="sm" className="h-auto px-0" testID={tid(testID, "how")}>
            {copy.howToFix}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <span className="block whitespace-pre-wrap text-sm text-foreground" data-testid={tid(testID, "instructions")}>
            {fix.instructions}
          </span>
        </CollapsibleContent>
      </Collapsible>
    );
  }
  return null;
}

/** What a plan needs that this host can't do. */
function missingFor(plan: SettingsPlan, caps: SettingsCapabilities): string[] {
  const out: string[] = [];
  if (plan.files.length && !caps.writeFiles) out.push("writeFiles");
  if (plan.commands.length && !caps.runCli) out.push("runCli");
  // A plan names its secrets, not their stores: only a host that can set every store applies it.
  if (plan.secrets.length && caps.setSecrets !== true) out.push("setSecrets");
  for (const layer of plan.layers ?? []) {
    if (layer === "database" && !caps.writeDatabase) out.push("writeDatabase");
    if (layer === "file" && !caps.writeFiles && !out.includes("writeFiles")) out.push("writeFiles");
  }
  return out;
}

/**
 * Plan → review → confirm → apply. The plan's hash goes back with `apply`, so the host refuses a
 * plan that went stale while the person read it.
 */
function PlanSheet({ fixId, caps, client, copy, testID, onClose, onChanged, returnFocus }: TabProps & { fixId: string | null; onClose: () => void }) {
  const [plan, setPlan] = useState<SettingsPlan | null>(null);
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const [result, setResult] = useState<SettingsApplyResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const sheetId = tid(testID, "plan-sheet");
  // Each plan request (and each close) takes a new number; a response is used only while its
  // number is current, so a late plan for fix A never shows, or applies, in fix B's sheet.
  const request = useRef(0);

  const makePlan = useCallback(async (id: string) => {
    const mine = ++request.current;
    setBusy(true);
    setPlan(null);
    setError(null);
    setResult(null);
    setConfirming(false);
    try {
      const next = await client.plan(id);
      if (mine === request.current) setPlan(next);
    } catch (e) {
      if (mine === request.current) setError({ message: errorMessage(e), stale: false });
    } finally {
      if (mine === request.current) setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    if (fixId) void makePlan(fixId);
    else {
      request.current++;
      setPlan(null);
      setError(null);
      setResult(null);
      setConfirming(false);
      setBusy(false);
    }
  }, [fixId, makePlan]);

  const apply = async () => {
    if (!plan) return;
    const mine = request.current;
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const applied = await client.apply(plan.fixId, plan.hash);
      if (mine === request.current) setResult(applied);
      await onChanged();
    } catch (e) {
      const stale = e instanceof SettingsProtocolError && e.code === "stale_plan";
      if (mine === request.current) setError({ message: stale ? copy.stalePlan : errorMessage(e), stale });
    } finally {
      if (mine === request.current) setBusy(false);
    }
  };

  const missing = plan ? missingFor(plan, caps) : [];
  return (
    <Sheet open={fixId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent data-testid={sheetId} className="flex flex-col gap-4 sm:max-w-2xl" onCloseAutoFocus={returnFocus}>
        <SheetHeader>
          <SheetTitle>{copy.planTitle(fixId ?? "")}</SheetTitle>
          <SheetDescription>{plan ? plan.summary : copy.planLoading}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-col gap-4 px-4">
          {busy && !plan ? <PageLoading label={copy.planLoading} /> : null}
          {plan ? (
            <>
              {plan.files.length ? (
                <Section title={copy.planFiles} level={3}>
                  <ul className="flex flex-col gap-3" data-testid={tid(sheetId, "files")}>
                    {plan.files.map((f) => (
                      <li key={f.path} className="flex flex-col gap-1">
                        <span className="break-all font-mono text-sm">{f.path}</span>
                        <span className="text-xs text-muted-foreground">{f.why}</span>
                        {f.diff ? <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{f.diff}</pre> : null}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
              {plan.commands.length ? (
                <Section title={copy.planCommands} level={3}>
                  <ul className="flex flex-col gap-2" data-testid={tid(sheetId, "commands")}>
                    {plan.commands.map((c, i) => (
                      <li key={i} className="flex flex-col gap-1">
                        <Code>{[c.tool, ...c.args].join(" ")}</Code>
                        <span className="text-xs text-muted-foreground">{c.why}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
              {plan.secrets.length ? (
                <Section title={copy.planSecrets} level={3}>
                  <p className="text-sm" data-testid={tid(sheetId, "secrets")}>
                    {plan.secrets.join(", ")}
                  </p>
                </Section>
              ) : null}
              {plan.manual ? (
                <Section title={copy.planManual} level={3}>
                  <p className="whitespace-pre-wrap text-sm">{plan.manual}</p>
                </Section>
              ) : null}
              {missing.length ? (
                <InlineAlert
                  variant="warning"
                  description={
                    <>
                      {copy.planNeeds} <Code>genesis fix {plan.fixId}</Code>
                    </>
                  }
                  testID={tid(sheetId, "needs")}
                />
              ) : null}
            </>
          ) : null}
          {result ? (
            <InlineAlert
              variant={result.verified ? "success" : "warning"}
              title={result.verified ? copy.applied : copy.appliedUnverified}
              description={result.pullRequestUrl ?? result.message}
              testID={tid(sheetId, "result")}
            />
          ) : null}
          {error ? (
            <InlineAlert
              variant="destructive"
              description={error.message}
              testID={tid(sheetId, "error")}
              actions={
                error.stale && fixId ? (
                  <Button size="sm" variant="outline" onClick={() => void makePlan(fixId)} testID={tid(sheetId, "replan")}>
                    {copy.planAgain}
                  </Button>
                ) : undefined
              }
            />
          ) : null}
        </div>
        <SheetFooter className="mt-auto flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} testID={tid(sheetId, "cancel")}>
            {copy.cancel}
          </Button>
          {plan && !result && !missing.length ? (
            <Button onClick={() => setConfirming(true)} disabled={busy} testID={tid(sheetId, "apply")}>
              {copy.apply}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent data-testid={tid(sheetId, "confirm")}>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{plan ? copy.confirmBody(plan.files.length, plan.commands.length) : null}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid={tid(sheetId, "confirm-cancel")}>{copy.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void apply()} data-testid={tid(sheetId, "confirm-apply")}>
              {copy.confirmApply}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

/**
 * Names and status only. Each field is picked by name, so a value a host sent by mistake is never
 * drawn. A Vault secret can be set or rotated when the host allows it: write-only, the value is
 * held only while the person types it and dropped once sent.
 */
function SecretsTab({ secrets, caps, client, copy, testID, onChanged }: TabProps & { secrets: readonly SettingsSecretStatus[] }) {
  // The sheet stays mounted and opens and closes, so Radix returns focus to the button that opened it.
  const [setting, setSetting] = useState<{ name: string; nonce: number } | null>(null);
  const [open, setOpen] = useState(false);
  const { remember, returnFocus } = useReturnFocus();
  if (!secrets.length) return <EmptyState title={copy.secretsEmpty} />;
  const canVault = canSetSecret(caps, "vault") && typeof client.setSecret === "function";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{copy.secretHint}</p>
      <div className="divide-y">
        {[...secrets]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((s) => {
            const rowId = tid(testID, "secret", s.name);
            const neededBy = Array.isArray(s.neededBy) ? s.neededBy : [];
            return (
              <SettingsRow
                key={`${s.store}:${s.name}`}
                testID={rowId}
                label={<span className="break-all font-mono text-sm">{s.name}</span>}
                description={
                  <span className="flex flex-col gap-0.5">
                    <span>{copy.secretStores[s.store] ?? s.store}</span>
                    {neededBy.length ? <span className="break-words">{copy.neededBy(neededBy.join(", "))}</span> : null}
                    {s.lastRotated ? <span>{copy.lastRotated(copy.formatTime(s.lastRotated))}</span> : null}
                  </span>
                }
              >
                <Badge variant={SECRET_VARIANT[s.status] ?? "muted"} data-testid={tid(rowId, "status")} data-status={s.status}>
                  {copy.secretStatus[s.status] ?? s.status}
                </Badge>
                {canVault && s.store === "vault" ? (
                  <Button size="sm" variant="outline" onClick={(e) => {
                      remember(e.currentTarget);
                      setSetting((prev) => ({ name: s.name, nonce: (prev?.nonce ?? 0) + 1 }));
                      setOpen(true);
                    }}
                    aria-label={copy.secretLabel(s.name)} testID={tid(rowId, "set")}>
                    {s.status === "set" ? copy.rotateSecret : copy.setSecret}
                  </Button>
                ) : null}
              </SettingsRow>
            );
          })}
      </div>
      <Sheet open={open && setting !== null} onOpenChange={(o) => (o ? undefined : setOpen(false))}>
        {setting ? (
          <SecretSheet
            key={setting.nonce}
            name={setting.name}
            caps={caps}
            client={client}
            copy={copy}
            testID={testID}
            onClose={() => setOpen(false)}
            onChanged={onChanged}
            returnFocus={returnFocus}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

/** `text` with every occurrence of `secret` replaced, so an error that echoes the value never shows it. */
function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join("•••") : text;
}

/**
 * The Vault form. The input is uncontrolled: React never holds the value, so it never reaches the
 * `value` attribute or the markup. It is read once on save and cleared at once (before the request
 * settles), on close and on unmount.
 */
function SecretSheet({ name, client, copy, testID, onClose, onChanged, returnFocus }: TabProps & { name: string; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const sheetId = tid(testID, "secret-sheet");
  const clear = () => {
    if (input.current) input.current.value = "";
    setEmpty(true);
  };
  useEffect(() => {
    const el = input.current;
    return () => {
      if (el) el.value = "";
    };
  }, []);
  const close = () => {
    clear();
    onClose();
  };
  const save = async () => {
    const value = input.current?.value ?? "";
    if (!value || !client.setSecret) return;
    // Out of the field as soon as it is read, not when the request settles.
    clear();
    setBusy(true);
    setError(null);
    try {
      await client.setSecret({ name, store: "vault", value });
      close();
      await onChanged();
    } catch (e) {
      setError(redact(errorMessage(e), value));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SheetContent data-testid={sheetId} className="flex flex-col gap-4 sm:max-w-lg" onCloseAutoFocus={returnFocus}>
      <SheetHeader>
        <SheetTitle>{copy.setSecretTitle(name)}</SheetTitle>
        <SheetDescription>{copy.setSecretDescription}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-1.5 px-4">
        <Label htmlFor={inputId}>{copy.secretValue}</Label>
        <Input
          ref={input}
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          defaultValue=""
          onInput={(e) => setEmpty(e.currentTarget.value === "")}
          data-testid={tid(sheetId, "input")}
        />
        {error ? <InlineAlert variant="destructive" description={error} testID={tid(sheetId, "error")} /> : null}
      </div>
      <SheetFooter className="mt-auto flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={close} testID={tid(sheetId, "cancel")}>
          {copy.cancel}
        </Button>
        <Button onClick={() => void save()} disabled={busy || empty} testID={tid(sheetId, "save")}>
          {copy.save}
        </Button>
      </SheetFooter>
    </SheetContent>
  );
}

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------

function UpgradesTab({ initial, caps, client, copy, testID, onChanged }: TabProps & { initial: SettingsUpgrades | undefined }) {
  const [upgrades, setUpgrades] = useState<SettingsUpgrades | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const { remember, returnFocus } = useReturnFocus();

  const checks = useRef(0);
  // A refreshed snapshot replaces whatever a check still in flight would bring: that check is stale.
  useEffect(() => {
    checks.current++;
    setUpgrades(initial);
    setBusy(false);
  }, [initial]);

  const check = async (refresh: boolean) => {
    const mine = ++checks.current;
    setBusy(true);
    setError(null);
    try {
      const next = await client.upgrades({ refresh });
      if (mine === checks.current) setUpgrades(next);
    } catch (e) {
      if (mine === checks.current) setError(errorMessage(e));
    } finally {
      if (mine === checks.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {upgrades?.checkedAt ? copy.checkedAt(copy.formatTime(upgrades.checkedAt)) : null}
          {upgrades?.offline ? ` ${copy.offline}` : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void check(true)} disabled={busy} testID={tid(testID, "upgrades-check")}>
            {copy.checkAgain}
          </Button>
          {upgrades?.fix && caps.runCli ? (
            <Button size="sm" onClick={(e) => {
                remember(e.currentTarget);
                setFixing(upgrades.fix!.id);
              }} testID={tid(testID, "upgrades-pr")}>
              {copy.openUpgradePr}
            </Button>
          ) : null}
        </div>
      </div>
      {upgrades?.fix && !caps.runCli ? (
        <p className="text-sm text-muted-foreground" data-testid={tid(testID, "upgrades-cli")}>
          {copy.runInTerminal} <Code>genesis upgrade</Code>
        </p>
      ) : null}
      {error ? <InlineAlert variant="destructive" description={error} testID={tid(testID, "upgrades-error")} /> : null}
      {!upgrades?.packages.length ? (
        <EmptyState title={copy.upgradesEmpty} />
      ) : (
        <div className="divide-y">
          {upgrades.packages.map((p) => {
            const rowId = tid(testID, "upgrade", p.name);
            return (
              <SettingsRow
                key={p.name}
                testID={rowId}
                label={<span className="break-all font-mono text-sm">{p.name}</span>}
                description={
                  <span className="flex flex-col gap-1">
                    <span>
                      {p.current}
                      {p.latest && p.latest !== p.current ? ` → ${p.latest}` : ""}
                    </span>
                    {p.notes ? <span className="whitespace-pre-wrap">{p.notes}</span> : null}
                    {safeHref(p.notesUrl) ? (
                      <a className="text-primary-text underline-offset-4 hover:underline" href={safeHref(p.notesUrl)} target="_blank" rel="noreferrer">
                        {copy.releaseNotes}
                      </a>
                    ) : null}
                  </span>
                }
              >
                {p.advisory ? <Badge variant="destructive">{copy.advisory}</Badge> : null}
                <Badge variant={DISTANCE_VARIANT[p.distance] ?? "muted"} data-testid={tid(rowId, "distance")}>
                  {copy.distance[p.distance] ?? p.distance}
                </Badge>
              </SettingsRow>
            );
          })}
        </div>
      )}
      <PlanSheet fixId={fixing} caps={caps} client={client} copy={copy} testID={testID} onClose={() => setFixing(null)} onChanged={onChanged} returnFocus={returnFocus} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/**
 * The history, a page at a time. Rows rather than a ResourceView: the pages come from the
 * protocol's cursor, not a DataProvider resource (see the README's "Audit" note).
 */
function AuditTab({
  state,
  client,
  copy,
  testID,
  pageSize,
  tenant,
}: {
  state: SettingsState;
  client: SettingsClient;
  copy: Copy;
  testID: string;
  pageSize: number;
  tenant: string | undefined;
}) {
  const initial = state.audit;
  const [entries, setEntries] = useState<readonly SettingsAuditEntry[]>(initial?.entries ?? []);
  const [next, setNext] = useState<string | undefined>(initial?.next);
  // The host left the history out of `state`: the first page is fetched here.
  const [fetched, setFetched] = useState(initial !== undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(() => secretNames(state.catalogue, state.secrets), [state.catalogue, state.secrets]);

  // A reload (not a next page) makes every earlier request's answer stale.
  const pages = useRef(0);
  const load = useCallback(
    async (cursor: string | undefined, append: boolean) => {
      const mine = append ? pages.current : ++pages.current;
      setBusy(true);
      setError(null);
      try {
        const page = await client.audit({ ...(cursor !== undefined ? { cursor } : {}), limit: pageSize, ...(tenant !== undefined ? { tenant } : {}) });
        if (mine !== pages.current) return;
        const got = Array.isArray(page?.entries) ? page.entries : [];
        setEntries((prev) => (append ? [...prev, ...got] : got));
        setNext(page?.next);
      } catch (e) {
        if (mine === pages.current) setError(errorMessage(e));
      } finally {
        if (mine === pages.current) {
          setBusy(false);
          setFetched(true);
        }
      }
    },
    [client, pageSize, tenant],
  );

  useEffect(() => {
    if (initial) {
      // Supersedes a page still loading: its answer is dropped, so its busy and error go with it.
      pages.current++;
      setEntries(initial.entries ?? []);
      setNext(initial.next);
      setBusy(false);
      setError(null);
      setFetched(true);
    } else void load(undefined, false);
  }, [initial, load]);

  if (!fetched) return <PageLoading label={copy.loading} testID={tid(testID, "audit-loading")} />;
  if (!entries.length && !next && !error) return <EmptyState title={copy.auditEmpty} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="divide-y">
        {entries.map((e) => {
          // Before and after only for a set or clear of a catalogue key that is no secret
          // (auditValuesVisible): a fix, an upgrade or a secret shows its subject and summary only.
          const change =
            auditValuesVisible(e, state.catalogue, names) && (e.before !== undefined || e.after !== undefined)
              ? `${formatValue(e.before, copy)} → ${formatValue(e.after, copy)}`
              : null;
          return (
            <SettingsRow
              key={e.id}
              testID={tid(testID, "audit", e.id)}
              label={
                <span className="whitespace-normal break-words leading-snug">
                  {copy.auditActions[e.action] ?? e.action} <span className="font-mono">{e.subject}</span>
                </span>
              }
              description={
                <span className="flex flex-col gap-0.5">
                  {e.summary ? <span>{e.summary}</span> : null}
                  {change ? <span className="break-all">{change}</span> : null}
                  <span>
                    {[e.actor, copy.formatTime(e.at), e.layer ? layerLabel(copy, e.layer) : null, e.locked ? copy.lock : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              }
            />
          );
        })}
      </div>
      {error ? <InlineAlert variant="destructive" description={error} testID={tid(testID, "audit-error")} /> : null}
      {next ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => void load(next, true)} disabled={busy} testID={tid(testID, "audit-more")}>
            {copy.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
