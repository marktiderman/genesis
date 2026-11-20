/**
 * The setup wizard's page. Two modes, one engine:
 *
 * - **setup** (an app is here): the shared Settings screen (`<GenesisSettings>`, the one the app's
 *   platform admin mounts too) on its Health tab, and the guided setup steps.
 * - **init** (an empty folder): App, Preset, Packages and Review, then the app is made through
 *   the same fix engine, and the wizard carries on in setup.
 *
 * Every write is a plan shown here first (`PlanDialog`); a secret is typed into a password field
 * (`SecretsDialog`), sent once, and never shown again.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChoiceCard,
  InlineAlert,
  Input,
  Label,
  PageLoading,
  RadioGroup,
  Stepper,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleRow,
} from "@marktiderman/genesis-ui";
import { GenesisSettings } from "@marktiderman/genesis-config/settings/react";
import type { SettingsPlan, SettingsSecretStatus } from "@marktiderman/genesis-config/settings-protocol";
import { applyPlan, call, CancelledError, changeSetting, subscribe, wizardSettingsClient, type Approvals } from "./client";

interface StepKey {
  key: string;
  summary?: string;
  set: boolean;
}
interface SetupStep {
  id: string;
  packages: string[];
  keys: StepKey[];
  secrets: Array<{ name: string; store: string }>;
  done: boolean;
  command: string;
}
interface Info {
  mode: "init" | "setup";
  root: string;
  app: string;
  presets: string[];
  defaultPreset: string;
  switches?: Record<string, boolean>;
  folderEmpty?: boolean;
  steps?: SetupStep[];
  needsInstall?: boolean;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The dialogs every write goes through, as promises the client awaits. */
function useApprovals() {
  const [plan, setPlan] = useState<SettingsPlan | null>(null);
  const [secretNames, setSecretNames] = useState<readonly string[] | null>(null);
  const resolvePlan = useRef<((ok: boolean) => void) | null>(null);
  const resolveSecrets = useRef<((v: Record<string, string> | null) => void) | null>(null);
  const approvals = useMemo<Approvals>(
    () => ({
      confirmPlan: (p) =>
        new Promise<boolean>((resolve) => {
          resolvePlan.current = resolve;
          setPlan(p);
        }),
      askSecrets: (names) =>
        new Promise((resolve) => {
          resolveSecrets.current = resolve;
          setSecretNames(names);
        }),
    }),
    [],
  );
  const dialogs = (
    <>
      <PlanDialog
        plan={plan}
        onAnswer={(ok) => {
          setPlan(null);
          resolvePlan.current?.(ok);
          resolvePlan.current = null;
        }}
      />
      <SecretsDialog
        names={secretNames}
        onAnswer={(values) => {
          setSecretNames(null);
          resolveSecrets.current?.(values);
          resolveSecrets.current = null;
        }}
      />
    </>
  );
  return { approvals, dialogs };
}

function PlanBody({ plan }: { plan: SettingsPlan }) {
  return (
    <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto text-sm" data-testid="wizard-plan">
      <p>{plan.summary}</p>
      {plan.files.length ? (
        <div>
          <p className="font-medium">Files ({plan.files.length})</p>
          <ul className="flex flex-col gap-2">
            {plan.files.slice(0, 200).map((f) => (
              <li key={f.path}>
                <code className="font-mono text-xs">
                  {f.created ? "create" : "write"} {f.path}
                </code>
                <span className="text-muted-foreground"> · {f.why}</span>
                {f.diff ? <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-xs">{f.diff}</pre> : null}
              </li>
            ))}
            {plan.files.length > 200 ? <li className="text-muted-foreground">… and {plan.files.length - 200} more</li> : null}
          </ul>
        </div>
      ) : null}
      {plan.commands.length ? (
        <div>
          <p className="font-medium">Commands</p>
          <ul>
            {plan.commands.map((c, i) => (
              <li key={i}>
                <code className="font-mono text-xs">{[c.tool, ...c.args].join(" ")}</code>
                <span className="text-muted-foreground"> · {c.why}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {plan.secrets.length ? <p>Needs {plan.secrets.join(", ")}: you type each value next; it is never shown or stored.</p> : null}
      {plan.manual ? <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{plan.manual}</pre> : null}
      <p className="font-mono text-xs text-muted-foreground">plan {plan.hash.slice(0, 16)}</p>
    </div>
  );
}

function PlanDialog({ plan, onAnswer }: { plan: SettingsPlan | null; onAnswer: (ok: boolean) => void }) {
  return (
    <AlertDialog open={plan !== null} onOpenChange={(open) => (!open ? onAnswer(false) : undefined)}>
      <AlertDialogContent className="max-w-2xl" data-testid="wizard-plan-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Apply this plan?</AlertDialogTitle>
          <AlertDialogDescription>Nothing is written until you apply it. If anything changes first, the wizard refuses it and plans again.</AlertDialogDescription>
        </AlertDialogHeader>
        {plan ? <PlanBody plan={plan} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="wizard-plan-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onAnswer(true)} data-testid="wizard-plan-apply">
            Apply
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SecretsDialog({ names, onAnswer }: { names: readonly string[] | null; onAnswer: (values: Record<string, string> | null) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => setValues({}), [names]);
  const ready = names?.every((n) => (values[n] ?? "").trim().length >= 8) ?? false;
  const answer = (v: Record<string, string> | null) => {
    setValues({});
    onAnswer(v);
  };
  return (
    <AlertDialog open={names !== null} onOpenChange={(open) => (!open ? answer(null) : undefined)}>
      <AlertDialogContent data-testid="wizard-secrets-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Type the secrets</AlertDialogTitle>
          <AlertDialogDescription>Each goes to your signed-in CLI on stdin, once. The wizard never shows, logs or keeps it.</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="flex flex-col gap-3"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) answer(values);
          }}
        >
          {names?.map((name) => (
            <div key={name} className="flex flex-col gap-1">
              <Label htmlFor={`secret-${name}`}>{name}</Label>
              <Input
                id={`secret-${name}`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={values[name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                data-testid={`wizard-secret-${name}`}
              />
            </div>
          ))}
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!ready} onClick={() => answer(values)} data-testid="wizard-secrets-apply">
            Set
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function useLog() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(
    () =>
      subscribe((event, data) => {
        if (event === "log") setLines((l) => [...l.slice(-200), String((data as { line?: unknown }).line ?? "")]);
        if (event === "apply" && (data as { state?: string }).state === "running") setLines([]);
      }),
    [],
  );
  return lines;
}

function Log({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs" data-testid="wizard-log">{lines.join("\n")}</pre>;
}

function Result({ result }: { result: { ok: boolean; text: string } | null }) {
  if (!result) return null;
  return <InlineAlert variant={result.ok ? "success" : "destructive"} title={result.ok ? "Done" : "Not done"} description={result.text} testID="wizard-result" />;
}

/** One guided step: its keys (set through a plan) and its secrets' status. */
function StepCard({ step, secrets, approvals, onChanged, focused }: { step: SetupStep; secrets: readonly SettingsSecretStatus[]; approvals: Approvals; onChanged: () => void; focused: boolean }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<{ verified: boolean; message?: string }>) => {
    setBusy(true);
    try {
      const r = await work();
      setResult({ ok: r.verified, text: r.message ?? (r.verified ? "Applied and verified." : "Applied; not verified yet.") });
      onChanged();
    } catch (e) {
      if (!(e instanceof CancelledError)) setResult({ ok: false, text: message(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card data-testid={`wizard-step-${step.id}`} className={focused ? "ring-2 ring-primary" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {step.id} <Badge variant={step.done ? "success" : "muted"}>{step.done ? "Set up" : "Dormant"}</Badge>
        </CardTitle>
        <CardDescription>
          {step.packages.join(", ")} · <code className="font-mono text-xs">{step.command}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step.keys.map((k) => (
          <form
            key={k.key}
            className="flex flex-col gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const raw = (drafts[k.key] ?? "").trim();
              if (raw) void run(() => changeSetting(k.key, { value: raw }, approvals));
            }}
          >
            <Label htmlFor={`key-${k.key}`}>
              settings.{k.key} {k.set ? <Badge variant="success">set</Badge> : null}
            </Label>
            {k.summary ? <p className="text-xs text-muted-foreground">{k.summary}</p> : null}
            <div className="flex gap-2">
              <Input id={`key-${k.key}`} value={drafts[k.key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [k.key]: e.target.value }))} placeholder={k.set ? "Change it" : "Not set"} data-testid={`wizard-key-${k.key}`} />
              <Button type="submit" variant="outline" disabled={busy || !(drafts[k.key] ?? "").trim()}>
                Plan
              </Button>
            </div>
          </form>
        ))}
        {step.secrets.map((s) => {
          const status = secrets.find((x) => x.name === s.name)?.status;
          return (
            <div key={s.name} className="flex items-center justify-between gap-2 text-sm">
              <span>
                Secret <code className="font-mono">{s.name}</code> ({s.store}) <Badge variant={status === "set" ? "success" : status === "missing" ? "destructive" : "muted"}>{status ?? "needed once the key is set"}</Badge>
              </span>
              {status === "missing" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const { plan } = await call<{ plan: SettingsPlan }>("plan", { fixId: "secrets.set", subject: s.name });
                      if (!(await approvals.confirmPlan(plan))) throw new CancelledError();
                      return applyPlan(plan, approvals);
                    })
                  }
                >
                  Set
                </Button>
              ) : null}
            </div>
          );
        })}
        <Result result={result} />
      </CardContent>
    </Card>
  );
}

function SetupScreen({ info, step, approvals, reload }: { info: Info; step?: string; approvals: Approvals; reload: () => void }) {
  const client = useMemo(() => wizardSettingsClient(approvals), [approvals]);
  const [secrets, setSecrets] = useState<readonly SettingsSecretStatus[]>([]);
  const [tab, setTab] = useState(step ? "steps" : "health");
  const [focus, setFocus] = useState(step);
  const [version, setVersion] = useState(0);
  const lines = useLog();
  useEffect(() => {
    void client
      .state()
      .then((s) => setSecrets(s.secrets))
      .catch(() => setSecrets([]));
  }, [client, version]);
  const changed = () => {
    setVersion((v) => v + 1);
    reload();
  };
  const steps = info.steps ?? [];
  if (info.needsInstall) return <InstallCard approvals={approvals} onDone={changed} />;
  return (
    <Tabs value={tab} onValueChange={setTab} defaultValue="health">
      <TabsList>
        <TabsTrigger value="health" data-testid="wizard-tab-health">
          Health and settings
        </TabsTrigger>
        <TabsTrigger value="steps" data-testid="wizard-tab-steps">
          Guided steps {steps.length ? <Badge variant={steps.some((s) => !s.done) ? "muted" : "success"} className="ml-1.5">{steps.filter((s) => s.done).length}/{steps.length}</Badge> : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="health" className="flex flex-col gap-4 pt-4">
        <Log lines={lines} />
        <GenesisSettings key={version} client={client} defaultTab="health" header={false} onOpenStep={(id) => {
            setFocus(id);
            setTab("steps");
          }} />
      </TabsContent>
      <TabsContent value="steps" className="flex flex-col gap-4 pt-4">
        <Log lines={lines} />
        {steps.length ? (
          steps.map((s) => <StepCard key={s.id} step={s} secrets={secrets} approvals={approvals} onChanged={changed} focused={s.id === focus} />)
        ) : (
          <p className="text-sm text-muted-foreground">No installed package names a guided setup step.</p>
        )}
        <p className="text-xs text-muted-foreground">Each step stays dormant until it is set up; nothing fails meanwhile. Walking an outside service and verifying it live comes with each step's own runner.</p>
      </TabsContent>
    </Tabs>
  );
}

/** A new app's packages aren't installed: the CLI installs them, as a plan like any other. */
function InstallCard({ approvals, onDone }: { approvals: Approvals; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const lines = useLog();
  const install = async () => {
    setBusy(true);
    try {
      const { plan } = await call<{ plan: SettingsPlan }>("install.plan");
      if (!(await approvals.confirmPlan(plan))) return;
      const r = await applyPlan(plan, approvals);
      setResult({ ok: r.verified, text: r.message ?? "" });
      if (r.verified) onDone();
    } catch (e) {
      if (!(e instanceof CancelledError)) setResult({ ok: false, text: message(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card data-testid="wizard-install">
      <CardHeader>
        <CardTitle>Install the app's packages</CardTitle>
        <CardDescription>The doctor and the settings read the installed Genesis packages. The CLI runs the install for you.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Log lines={lines} />
        <Result result={result} />
        <div>
          <Button disabled={busy} onClick={() => void install()} data-testid="wizard-install-plan">
            {busy ? "Installing…" : "Plan the install"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const PRESETS: Record<string, string> = {
  max: "Every feature on. The default: nothing to configure.",
  standard: "A middle set: each package says which of its features it turns off.",
  min: "The least each package runs with.",
};

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function InitScreen({ info, approvals, reload }: { info: Info; approvals: Approvals; reload: () => void }) {
  const [current, setCurrent] = useState(0);
  const [app, setApp] = useState({ slug: "", displayName: "", bundleId: "", folder: "" });
  const [preset, setPreset] = useState(info.defaultPreset);
  const [switches, setSwitches] = useState<Record<string, boolean>>(info.switches ?? {});
  const [plan, setPlan] = useState<SettingsPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = useLog();
  const steps = [{ label: "App" }, { label: "Preset" }, { label: "Packages" }, { label: "Review" }];
  const slugOk = /^[a-z][a-z0-9-]{1,40}$/.test(app.slug);
  const choices = () => ({
    slug: app.slug,
    ...(app.displayName ? { displayName: app.displayName } : {}),
    ...(app.bundleId ? { bundleId: app.bundleId } : {}),
    ...(app.folder ? { folder: app.folder } : {}),
    preset,
    without: Object.entries(switches).filter(([name, on]) => !on && info.switches?.[name]).map(([name]) => name),
  });
  const review = async () => {
    setBusy(true);
    setError(null);
    try {
      setPlan((await call<{ plan: SettingsPlan }>("init.plan", { app: choices() })).plan);
      setCurrent(3);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const r = await applyPlan(plan, approvals);
      if (!r.verified) setError(r.message ?? "The app wasn't made.");
      else reload();
    } catch (e) {
      setError(message(e));
      setPlan(null);
      setCurrent(2);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={steps} current={current} />
      {error ? <InlineAlert variant="destructive" title="Not done" description={error} testID="wizard-error" /> : null}
      {current === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>The app</CardTitle>
            <CardDescription>A new Expo app from the Genesis starter, made in {info.root}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field id="slug" label="Slug" hint="Lowercase letters, digits and -: the package name, the Expo slug and the URL scheme.">
              <Input id="slug" value={app.slug} onChange={(e) => setApp({ ...app, slug: e.target.value })} data-testid="wizard-init-slug" />
            </Field>
            <Field id="display" label="Name on the home screen" hint="Default: from the slug.">
              <Input id="display" value={app.displayName} onChange={(e) => setApp({ ...app, displayName: e.target.value })} />
            </Field>
            <Field id="bundle" label="Bundle id" hint="Default: com.example.<slug>.">
              <Input id="bundle" value={app.bundleId} onChange={(e) => setApp({ ...app, bundleId: e.target.value })} />
            </Field>
            <Field id="folder" label="Folder" hint="Default: the slug, beneath this folder.">
              <Input id="folder" value={app.folder} onChange={(e) => setApp({ ...app, folder: e.target.value })} />
            </Field>
            <div>
              <Button disabled={!slugOk} onClick={() => setCurrent(1)} data-testid="wizard-next">
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {current === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Preset</CardTitle>
            <CardDescription>Every setting starts from the preset. Max is the default: with it there is nothing to configure.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RadioGroup aria-label="Preset" value={preset} onValueChange={setPreset}>
              {info.presets.map((p) => (
                <ChoiceCard key={p} value={p} title={p} description={PRESETS[p]} testID={`wizard-preset-${p}`} />
              ))}
            </RadioGroup>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrent(0)}>
                Back
              </Button>
              <Button onClick={() => setCurrent(2)} data-testid="wizard-next">
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {current === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Packages</CardTitle>
            <CardDescription>The starter's features. One turned off leaves out its block: its tables, functions and screens.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Object.keys(info.switches ?? {}).map((name) => (
              <ToggleRow
                key={name}
                label={name}
                {...(info.switches?.[name] ? {} : { description: "Off in the starter: turn it on later in starter.config.ts." })}
                checked={switches[name] ?? false}
                disabled={!info.switches?.[name]}
                onCheckedChange={(on) => setSwitches((s) => ({ ...s, [name]: on }))}
                testID={`wizard-switch-${name}`}
              />
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setCurrent(1)}>
                Back
              </Button>
              <Button disabled={busy} onClick={() => void review()} data-testid="wizard-review">
                Review
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {current === 3 && plan ? (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>What making the app writes. Nothing is written until you create it.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PlanBody plan={plan} />
            <Log lines={lines} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrent(2)}>
                Back
              </Button>
              <Button disabled={busy} onClick={() => void create()} data-testid="wizard-create">
                Create the app
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function App({ step }: { step?: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { approvals, dialogs } = useApprovals();
  const load = useCallback(() => {
    call<Info>("wizard.info")
      .then((i) => {
        setInfo(i);
        setError(null);
      })
      .catch((e) => setError(message(e)));
  }, []);
  useEffect(load, [load]);
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8" data-testid="wizard">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{info?.mode === "init" ? "Make a Genesis app" : `Genesis setup${info ? ` · ${info.app}` : ""}`}</h1>
        <p className="text-sm text-muted-foreground">Served by the Genesis CLI on this computer only. Every change is a plan you read and apply.</p>
      </header>
      {error ? <InlineAlert variant="destructive" title="The wizard can't load" description={error} testID="wizard-load-error" /> : null}
      {!info && !error ? <PageLoading label="Loading" /> : null}
      {info?.mode === "init" ? <InitScreen info={info} approvals={approvals} reload={load} /> : null}
      {info?.mode === "setup" ? <SetupScreen info={info} {...(step ? { step } : {})} approvals={approvals} reload={load} /> : null}
      {dialogs}
    </main>
  );
}
