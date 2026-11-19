/**
 * `@marktiderman/genesis-config/settings/react`: the Settings screen, one UI for two hosts (the
 * localhost wizard and the app's platform-admin screen, config-layer §4). It talks to its host
 * only through a {@link SettingsClient}, and shows a write only when the host's capabilities (and
 * the `capabilities` prop, which can only narrow them) allow it.
 *
 * Tabs: Values (every key with its value, the layer it came from and its lock), Health (the
 * doctor's findings with their fixes), Secrets (set or missing, never a value), Upgrades and Audit.
 */
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
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
import { settingValueProblem, type SettingDef, type SettingSource, type SettingsLayer } from "./settings";
import {
  intersectCapabilities,
  settingFileSnippet,
  settingWritability,
  SettingsProtocolError,
  type SettingsApplyResult,
  type SettingsAuditEntry,
  type SettingsAuditPage,
  type SettingsCapabilities,
  type SettingsClient,
  type SettingsFinding,
  type SettingsFindingLevel,
  type SettingsFixRef,
  type SettingsPlan,
  type SettingsSecretStatus,
  type SettingsState,
  type SettingsUpgrades,
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
  editTitle: (key: string) => string;
  editDescription: string;
  writeLayer: string;
  lock: string;
  lockHint: string;
  save: string;
  cancel: string;
  clearLayer: (layer: string) => string;
  invalidJson: string;
  changeInRepo: string;
  changeInRepoTitle: (key: string) => string;
  changeInRepoDescription: string;
  openPullRequest: string;
  pullRequestOpened: string;
  readOnly: string;
  healthEmpty: string;
  healthEmptyDescription: string;
  levels: Record<SettingsFindingLevel, string>;
  fix: string;
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
  editTitle: (key) => `Edit ${key}`,
  editDescription: "A later layer wins unless an earlier one locked the value.",
  writeLayer: "Save in",
  lock: "Lock",
  lockHint: "Later layers can't change a locked value.",
  save: "Save",
  cancel: "Cancel",
  clearLayer: (layer) => `Clear the ${layer} value`,
  invalidJson: "That isn't valid JSON.",
  changeInRepo: "Change in repo",
  changeInRepoTitle: (key) => `Change ${key} in the repo`,
  changeInRepoDescription: "This key is set in genesis.config.json and reviewed like code. Commit this change:",
  openPullRequest: "Open pull request",
  pullRequestOpened: "Pull request opened.",
  readOnly: "Read-only here",
  healthEmpty: "Nothing needs attention",
  healthEmptyDescription: "The doctor found no problems.",
  levels: { error: "Error", warn: "Warning", info: "Info" },
  fix: "Fix…",
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
  secretHint: "Set secrets with genesis setup. Their values never reach this screen.",
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
  defaultTab?: GenesisSettingsTab;
  /** Opens a guided fix's setup step (the wizard routes to it). Without it, a step shows its CLI command. */
  onOpenStep?: (step: string) => void;
  /** Audit entries per page. Default 25. */
  auditPageSize?: number;
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
  defaultTab = "values",
  onOpenStep,
  auditPageSize = 25,
  testID = "genesis-settings",
  className,
}: GenesisSettingsProps) {
  const copy = useMemo<Copy>(() => ({ ...GENESIS_SETTINGS_COPY, ...copyOverride }), [copyOverride]);
  const [state, setState] = useState<SettingsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<GenesisSettingsTab>(defaultTab);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setState(await client.state({ auditLimit: auditPageSize }));
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [client, auditPageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const caps = useMemo(() => (state ? intersectCapabilities(state.capabilities, narrow ?? state.capabilities) : null), [state, narrow]);

  return (
    <div data-slot="genesis-settings" data-testid={testID} className={["flex flex-col gap-6", className].filter(Boolean).join(" ")}>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-xl font-[number:var(--page-title-font-weight)] tracking-[var(--page-title-letter-spacing)] sm:text-2xl">
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground">{state ? `${state.app.name} · ${copy.description}` : copy.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} testID={tid(testID, "refresh")}>
            {copy.refresh}
          </Button>
        </div>
      </header>

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
        <Tabs value={tab} onValueChange={(v) => setTab(v as GenesisSettingsTab)} defaultValue={defaultTab}>
          <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none]">
            {(["values", "health", "secrets", "upgrades", "audit"] as const).map((t) => (
              <TabsTrigger key={t} value={t} data-testid={tid(testID, "tab", t)}>
                {copy.tabs[t]}
                {t === "health" && state.findings.length ? (
                  <Badge variant={state.findings.some((f) => f.level === "error") ? "destructive" : "muted"} className="ml-1.5">
                    {state.findings.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="values" className="pt-4">
            <ValuesTab state={state} caps={caps} client={client} copy={copy} testID={testID} onChanged={load} />
          </TabsContent>
          <TabsContent value="health" className="pt-4">
            <HealthTab state={state} caps={caps} client={client} copy={copy} testID={testID} onChanged={load} onOpenStep={onOpenStep} />
          </TabsContent>
          <TabsContent value="secrets" className="pt-4">
            <SecretsTab secrets={state.secrets} copy={copy} testID={testID} />
          </TabsContent>
          <TabsContent value="upgrades" className="pt-4">
            <UpgradesTab initial={state.upgrades} caps={caps} client={client} copy={copy} testID={testID} onChanged={load} />
          </TabsContent>
          <TabsContent value="audit" className="pt-4">
            <AuditTab initial={state.audit} client={client} copy={copy} testID={testID} pageSize={auditPageSize} />
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
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

type Editing = { def: SettingDef; mode: "edit" | "repo" };

function ValuesTab({ state, caps, client, copy, testID, onChanged }: TabProps & { state: SettingsState }) {
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const filterId = useId();
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const byNs = new Map<string, SettingDef[]>();
    for (const def of [...state.catalogue].sort((a, b) => a.key.localeCompare(b.key))) {
      if (q && !def.key.toLowerCase().includes(q) && !(def.summary ?? "").toLowerCase().includes(q)) continue;
      byNs.set(def.namespace, [...(byNs.get(def.namespace) ?? []), def]);
    }
    return [...byNs.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [state.catalogue, filter]);

  return (
    <div className="flex flex-col gap-6">
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
                copy={copy}
                testID={testID}
                onEdit={(mode) => setEditing({ def, mode })}
              />
            ))}
          </div>
        </Section>
      ))}
      <ValueSheet
        editing={editing}
        state={state}
        caps={caps}
        client={client}
        copy={copy}
        testID={testID}
        onClose={() => setEditing(null)}
        onChanged={onChanged}
      />
    </div>
  );
}

function ValueRow({
  def,
  value,
  source,
  caps,
  copy,
  testID,
  onEdit,
}: {
  def: SettingDef;
  value: unknown;
  source: SettingSource | undefined;
  caps: SettingsCapabilities;
  copy: Copy;
  testID: string;
  onEdit: (mode: Editing["mode"]) => void;
}) {
  const writable = settingWritability(def, source, caps);
  // A build key on a host that can't write files: it changes in the repo, through a pull request or by hand.
  const repoOnly = !writable.layers.length && def.applies === "build" && writable.refused.file === "capability";
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
              {copy.layers[source?.layer ?? "default"]}
            </Badge>
            {source?.lockedBy ? (
              <Badge variant="warning" data-testid={tid(rowId, "lock")} data-layer={source.lockedBy}>
                <Lock aria-hidden className="mr-1 size-3" />
                {copy.lockedBy(copy.layers[source.lockedBy])}
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
        <Button variant="outline" size="sm" onClick={() => onEdit("edit")} aria-label={`${copy.edit} ${def.key}`} testID={tid(rowId, "edit")}>
          {copy.edit}
        </Button>
      ) : repoOnly ? (
        <Button variant="ghost" size="sm" onClick={() => onEdit("repo")} testID={tid(rowId, "repo")} aria-label={`${copy.changeInRepo}: ${def.key}`}>
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
}: {
  def: SettingDef;
  draft: string;
  onDraft: (next: string) => void;
  id: string;
  copy: Copy;
  testID: string;
}) {
  if (def.type === "boolean") {
    return (
      <div className="flex items-center gap-3">
        <Switch id={id} checked={draft === "true"} onCheckedChange={(on) => onDraft(on ? "true" : "false")} data-testid={tid(testID, "input")} />
        <Label htmlFor={id}>{draft === "true" ? copy.on : copy.off}</Label>
      </div>
    );
  }
  if (def.options && (def.type === "string" || def.type === "number")) {
    return (
      <Select value={draft} onValueChange={onDraft}>
        <SelectTrigger id={id} data-testid={tid(testID, "input")}>
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
    return <Textarea id={id} value={draft} onChange={(e) => onDraft(e.target.value)} rows={5} className="font-mono text-sm" data-testid={tid(testID, "input")} />;
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
function ValueSheet(props: TabProps & { editing: Editing | null; state: SettingsState; onClose: () => void }) {
  if (!props.editing) return null;
  return <ValueSheetBody key={`${props.editing.mode}:${props.editing.def.key}`} {...props} editing={props.editing} />;
}

function ValueSheetBody({
  editing,
  state,
  caps,
  client,
  copy,
  testID,
  onClose,
  onChanged,
}: TabProps & { editing: Editing; state: SettingsState; onClose: () => void }) {
  const def = editing.def;
  const source = state.resolved.sources[def.key];
  const writable = settingWritability(def, source, caps);
  // The layer that set the value, when the screen can write it; else the highest it can.
  const preferred: SettingsWriteLayer | undefined =
    source && writable.layers.includes(source.layer as SettingsWriteLayer) ? (source.layer as SettingsWriteLayer) : writable.layers[writable.layers.length - 1];
  const [layer, setLayer] = useState<SettingsWriteLayer | undefined>(preferred);
  const [draft, setDraft] = useState(() => toDraft(def, state.resolved.values[def.key]));
  const [locked, setLocked] = useState(() => (preferred ? state.layers[preferred]?.[def.key]?.locked === true : source?.lockedBy === "file"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<string | null>(null);
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
      await client.setValue({ key: def.key, value: parsed.value, locked, layer });
      onClose();
      await onChanged();
    });
  const clear = () =>
    run(async () => {
      if (!layer) return;
      await client.clearValue({ key: def.key, layer });
      onClose();
      await onChanged();
    });
  const propose = () =>
    run(async () => {
      if ("problem" in parsed) return;
      const result = await client.propose({ key: def.key, value: parsed.value, locked });
      setProposal(result.pullRequestUrl ?? result.snippet);
    });

  const repo = editing.mode === "repo";
  const inputId = `${baseId}-value`;
  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent data-testid={sheetId} className="flex flex-col gap-4 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{repo ? copy.changeInRepoTitle(def.key) : copy.editTitle(def.key)}</SheetTitle>
          <SheetDescription>{repo ? copy.changeInRepoDescription : def.summary ?? copy.editDescription}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>{def.key}</Label>
            <ValueInput def={def} draft={draft} onDraft={setDraft} id={inputId} copy={copy} testID={sheetId} />
            {problem ? (
              <p className="text-sm text-destructive" role="alert" data-testid={tid(sheetId, "problem")}>
                {problem}
              </p>
            ) : null}
          </div>
          {!repo && writable.layers.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" id={`${baseId}-layer`}>
                {copy.writeLayer}
              </span>
              <RadioGroup aria-labelledby={`${baseId}-layer`} value={layer} onValueChange={(v) => setLayer(v as SettingsWriteLayer)} className="flex gap-4">
                {writable.layers.map((l) => (
                  <div key={l} className="flex items-center gap-2">
                    <RadioGroupItem id={`${baseId}-layer-${l}`} value={l} data-testid={tid(sheetId, "layer", l)} />
                    <Label htmlFor={`${baseId}-layer-${l}`}>{copy.layers[l]}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : null}
          <div className="flex items-start gap-2">
            <Checkbox id={`${baseId}-lock`} checked={locked} onCheckedChange={(c) => setLocked(c === true)} data-testid={tid(sheetId, "lock")} />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor={`${baseId}-lock`}>{copy.lock}</Label>
              <span className="text-xs text-muted-foreground">{copy.lockHint}</span>
            </div>
          </div>
          {repo ? (
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs" data-testid={tid(sheetId, "snippet")}>
              {settingFileSnippet(def.key, "value" in parsed ? parsed.value : draft, locked)}
            </pre>
          ) : null}
          {proposal ? (
            <InlineAlert variant="success" title={copy.pullRequestOpened} description={proposal} testID={tid(sheetId, "proposal")} />
          ) : null}
          {error ? <InlineAlert variant="destructive" description={error} testID={tid(sheetId, "error")} /> : null}
        </div>
        <SheetFooter className="mt-auto flex-col gap-2 sm:flex-row sm:justify-end">
          {!repo && layer && layerHas ? (
            <Button variant="ghost" onClick={() => void clear()} disabled={busy} testID={tid(sheetId, "clear")}>
              {copy.clearLayer(copy.layers[layer])}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose} testID={tid(sheetId, "cancel")}>
            {copy.cancel}
          </Button>
          {repo ? (
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
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Health and fixes
// ---------------------------------------------------------------------------

/** Whether this host can plan and apply an automatic fix at all. */
function canAutoFix(caps: SettingsCapabilities): boolean {
  return caps.writeFiles || caps.runCli;
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
  const findings = useMemo(() => [...state.findings].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]), [state.findings]);
  if (!findings.length) return <EmptyState title={copy.healthEmpty} description={copy.healthEmptyDescription} />;
  return (
    <>
      <div className="divide-y">
        {findings.map((f) => (
          <FindingRow key={f.id} finding={f} caps={caps} copy={copy} testID={testID} onFix={setFixing} onOpenStep={onOpenStep} />
        ))}
      </div>
      <PlanSheet fixId={fixing} caps={caps} client={client} copy={copy} testID={testID} onClose={() => setFixing(null)} onChanged={onChanged} />
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
  onFix: (fixId: string) => void;
  onOpenStep: ((step: string) => void) | undefined;
}) {
  const fix = finding.fix;
  const rowId = tid(testID, "finding", finding.id);
  const where = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ""}` : null;
  return (
    <SettingsRow
      testID={rowId}
      label={<span className="whitespace-normal leading-snug">{finding.message}</span>}
      description={
        <span className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant={LEVEL_VARIANT[finding.level]}>{copy.levels[finding.level]}</Badge>
            <Code>{finding.rule}</Code>
            {where ? <span className="break-all">{where}</span> : null}
          </span>
          {fix ? <FixHint fix={fix} caps={caps} copy={copy} testID={rowId} onOpenStep={onOpenStep} /> : null}
        </span>
      }
    >
      {fix?.kind === "auto" && canAutoFix(caps) ? (
        <Button size="sm" onClick={() => onFix(fix.id)} testID={tid(rowId, "fix")} aria-label={`${copy.fix} ${finding.rule}`}>
          {copy.fix}
        </Button>
      ) : fix?.kind === "guided" && (fix.href || (onOpenStep && fix.step)) ? (
        fix.href ? (
          <Button size="sm" variant="outline" asChild>
            <a href={fix.href} data-testid={tid(rowId, "step")}>
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
  if (fix.kind === "auto" && !canAutoFix(caps)) {
    return (
      <span data-testid={tid(testID, "cli")}>
        {copy.runInTerminal} <Code>genesis fix {fix.id}</Code>
      </span>
    );
  }
  if (fix.kind === "guided" && !fix.href && !(onOpenStep && fix.step)) {
    return (
      <span data-testid={tid(testID, "cli")}>
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
  if (plan.secrets.length && !caps.setSecrets) out.push("setSecrets");
  return out;
}

/**
 * Plan → review → confirm → apply. The plan's hash goes back with `apply`, so the host refuses a
 * plan that went stale while the person read it.
 */
function PlanSheet({ fixId, caps, client, copy, testID, onClose, onChanged }: TabProps & { fixId: string | null; onClose: () => void }) {
  const [plan, setPlan] = useState<SettingsPlan | null>(null);
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);
  const [result, setResult] = useState<SettingsApplyResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const sheetId = tid(testID, "plan-sheet");

  const makePlan = useCallback(async (id: string) => {
    setBusy(true);
    setPlan(null);
    setError(null);
    setResult(null);
    try {
      setPlan(await client.plan(id));
    } catch (e) {
      setError({ message: errorMessage(e), stale: false });
    } finally {
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    if (fixId) void makePlan(fixId);
  }, [fixId, makePlan]);

  const apply = async () => {
    if (!plan) return;
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      setResult(await client.apply(plan.fixId, plan.hash));
      await onChanged();
    } catch (e) {
      const stale = e instanceof SettingsProtocolError && e.code === "stale_plan";
      setError({ message: stale ? copy.stalePlan : errorMessage(e), stale });
    } finally {
      setBusy(false);
    }
  };

  const missing = plan ? missingFor(plan, caps) : [];
  return (
    <Sheet open={fixId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent data-testid={sheetId} className="flex flex-col gap-4 sm:max-w-2xl">
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
 * drawn.
 */
function SecretsTab({ secrets, copy, testID }: { secrets: readonly SettingsSecretStatus[]; copy: Copy; testID: string }) {
  if (!secrets.length) return <EmptyState title={copy.secretsEmpty} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{copy.secretHint}</p>
      <div className="divide-y">
        {[...secrets]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((s) => {
            const rowId = tid(testID, "secret", s.name);
            return (
              <SettingsRow
                key={`${s.store}:${s.name}`}
                testID={rowId}
                label={<span className="break-all font-mono text-sm">{s.name}</span>}
                description={
                  <span className="flex flex-col gap-0.5">
                    <span>{copy.secretStores[s.store] ?? s.store}</span>
                    {s.neededBy.length ? <span className="break-words">{copy.neededBy(s.neededBy.join(", "))}</span> : null}
                    {s.lastRotated ? <span>{copy.lastRotated(copy.formatTime(s.lastRotated))}</span> : null}
                  </span>
                }
              >
                <Badge variant={SECRET_VARIANT[s.status] ?? "muted"} data-testid={tid(rowId, "status")} data-status={s.status}>
                  {copy.secretStatus[s.status] ?? s.status}
                </Badge>
              </SettingsRow>
            );
          })}
      </div>
    </div>
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

  useEffect(() => setUpgrades(initial), [initial]);

  const check = async (refresh: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setUpgrades(await client.upgrades({ refresh }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
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
            <Button size="sm" onClick={() => setFixing(upgrades.fix!.id)} testID={tid(testID, "upgrades-pr")}>
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
                    {p.notesUrl ? (
                      <a className="text-primary-text underline-offset-4 hover:underline" href={p.notesUrl} target="_blank" rel="noreferrer">
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
      <PlanSheet fixId={fixing} caps={caps} client={client} copy={copy} testID={testID} onClose={() => setFixing(null)} onChanged={onChanged} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function AuditTab({
  initial,
  client,
  copy,
  testID,
  pageSize,
}: {
  initial: SettingsAuditPage | undefined;
  client: SettingsClient;
  copy: Copy;
  testID: string;
  pageSize: number;
}) {
  const [entries, setEntries] = useState<readonly SettingsAuditEntry[]>(initial?.entries ?? []);
  const [next, setNext] = useState<string | undefined>(initial?.next);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntries(initial?.entries ?? []);
    setNext(initial?.next);
  }, [initial]);

  const more = async () => {
    setBusy(true);
    setError(null);
    try {
      const page = await client.audit({ ...(next !== undefined ? { cursor: next } : {}), limit: pageSize });
      setEntries((prev) => [...prev, ...page.entries]);
      setNext(page.next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!entries.length && !next) return <EmptyState title={copy.auditEmpty} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="divide-y">
        {entries.map((e) => {
          // A secret's change shows its name only: before and after are never drawn for it.
          const change =
            e.action !== "secret" && (e.before !== undefined || e.after !== undefined)
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
                    {[e.actor, copy.formatTime(e.at), e.layer ? copy.layers[e.layer] : null, e.locked ? copy.lock : null].filter(Boolean).join(" · ")}
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
          <Button variant="outline" size="sm" onClick={() => void more()} disabled={busy} testID={tid(testID, "audit-more")}>
            {copy.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
