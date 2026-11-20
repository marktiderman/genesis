/**
 * The page's side of the wizard's API. The token arrives in the URL fragment (never sent to the
 * server in a URL), moves to sessionStorage, and leaves the address bar; every request sends it as
 * a bearer token. No cookies.
 *
 * `wizardSettingsClient` is the settings protocol's client with the CLI host's rule on top: every
 * write is a plan the person approves. A value change is planned (`settings.plan`), shown, and
 * applied with its hash; a plan that needs secrets asks for their values, which go to the host in
 * that one request and are forgotten.
 */
import { createSettingsClient, SettingsProtocolError, SETTINGS_PROTOCOL_VERSION, type SettingsClient, type SettingsPlan } from "@marktiderman/genesis-config/settings-protocol";

const KEY = "genesis-wizard-token";

/** Read the fragment once: keep the token, return the step to open, and clear the address bar. */
export function takeFragment(): { step?: string } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("t");
  if (token) {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      /* private mode: the request will say to open the link again */
    }
    history.replaceState(null, "", window.location.pathname);
  }
  const step = params.get("step");
  return step ? { step } : {};
}

export function token(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** One wizard op: `{v, op, …}` to `/api`. Throws SettingsProtocolError with the host's message. */
export async function call<T>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  const t = token();
  if (!t) throw new SettingsProtocolError("unauthenticated", "Open the wizard from the link the CLI printed.");
  const res = await fetch("/api", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${t}` },
    body: JSON.stringify({ v: SETTINGS_PROTOCOL_VERSION, op, ...body }),
    credentials: "omit",
  });
  const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new SettingsProtocolError((json?.error?.code as never) ?? "error", json?.error?.message ?? `The wizard answered ${res.status}.`, res.status);
  return json as T;
}

/** The server's events (a fix's output as it runs), read with the bearer token. Returns a stop function. */
export function subscribe(onEvent: (event: string, data: unknown) => void): () => void {
  const controller = new AbortController();
  const t = token();
  if (!t) return () => {};
  void (async () => {
    try {
      const res = await fetch("/events", { headers: { authorization: `Bearer ${t}` }, signal: controller.signal, credentials: "omit" });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = /^event: (.+)$/m.exec(chunk)?.[1];
          const data = /^data: (.+)$/m.exec(chunk)?.[1];
          if (event && data) {
            try {
              onEvent(event, JSON.parse(data));
            } catch {
              /* a malformed event is skipped */
            }
          }
        }
      }
    } catch {
      /* closed */
    }
  })();
  return () => controller.abort();
}

/** What the page asks the person: approve a plan, and type the secrets it needs. */
export interface Approvals {
  confirmPlan(plan: SettingsPlan): Promise<boolean>;
  askSecrets(names: readonly string[], plan: SettingsPlan): Promise<Record<string, string> | null>;
}

export class CancelledError extends Error {
  constructor() {
    super("Not applied: you cancelled it.");
    this.name = "CancelledError";
  }
}

/** Apply a plan the person has seen: its secrets asked for first, sent once, never kept. */
export async function applyPlan(plan: SettingsPlan, approvals: Approvals) {
  let secrets: Record<string, string> | null = null;
  if (plan.secrets.length) {
    secrets = await approvals.askSecrets(plan.secrets, plan);
    if (!secrets) throw new CancelledError();
  }
  try {
    return (await call<{ result: { fixId: string; verified: boolean; message?: string; pullRequestUrl?: string } }>("apply", { fixId: plan.fixId, expect: plan.hash, ...(secrets ? { secrets } : {}) })).result;
  } finally {
    // Dropped as soon as the request is sent.
    if (secrets) for (const k of Object.keys(secrets)) secrets[k] = "";
  }
}

/** Plan a settings change, show it, and apply it on approval. */
export async function changeSetting(key: string, change: { value: unknown } | { clear: true }, approvals: Approvals) {
  const { plan } = await call<{ plan: SettingsPlan }>("settings.plan", { key, ...change });
  if (!plan.files.length) return { fixId: plan.fixId, verified: true, message: plan.summary };
  if (!(await approvals.confirmPlan(plan))) throw new CancelledError();
  return applyPlan(plan, approvals);
}

/**
 * The client the shared Settings screen (`<GenesisSettings>`) talks to: the protocol's, with
 * `setValue` and `clearValue` turned into approved plans, and `apply` asking for a plan's secrets.
 */
export function wizardSettingsClient(approvals: Approvals): SettingsClient {
  const base = createSettingsClient(fetch, { baseUrl: "/api", token });
  const plans = new Map<string, SettingsPlan>();
  return {
    ...base,
    async plan(fixId) {
      const plan = await base.plan(fixId);
      plans.set(plan.hash, plan);
      return plan;
    },
    async apply(fixId, expect) {
      const plan = plans.get(expect);
      if (plan?.secrets.length) return applyPlan(plan, approvals);
      return base.apply(fixId, expect);
    },
    async setValue({ key, value, layer }) {
      if (layer !== "file") throw new SettingsProtocolError("unsupported", "The wizard writes genesis.config.json; the database layer is the app's own Settings screen.");
      await changeSetting(key, { value }, approvals);
    },
    async clearValue({ key, layer }) {
      if (layer !== "file") throw new SettingsProtocolError("unsupported", "The wizard writes genesis.config.json; the database layer is the app's own Settings screen.");
      await changeSetting(key, { clear: true }, approvals);
    },
  };
}
