/**
 * The page's side of the wizard's API. The link the CLI opens carries a one-time launch code in
 * its fragment (never sent to the server in a URL); the page swaps it for the session token at
 * `POST /session`, clears the address bar, and keeps the token in sessionStorage. Every request
 * sends it as a bearer token. No cookies.
 *
 * `wizardSettingsClient` is the settings protocol's client with the CLI host's rule on top: every
 * write is a plan the person approves. A value change is planned (`settings.plan`), shown, and
 * applied with its hash; a plan that needs secrets asks for their values, which go to the host in
 * that one request and are forgotten.
 */
import { createSettingsClient, SettingsProtocolError, SETTINGS_PROTOCOL_VERSION, type SettingsClient, type SettingsPlan } from "@marktiderman/genesis-config/settings-protocol";

const KEY = "genesis-wizard-token";

/**
 * Read the fragment once: swap its launch code for the session token, return the step to open,
 * and clear the address bar. A used or expired code leaves no token; the page then says to open
 * a new link.
 */
export async function takeFragment(): Promise<{ step?: string }> {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get("c");
  const step = params.get("step");
  if (window.location.hash) history.replaceState(null, "", window.location.pathname);
  if (code) {
    try {
      const res = await fetch("/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }), credentials: "omit" });
      const json = (await res.json().catch(() => null)) as { token?: unknown } | null;
      if (res.ok && typeof json?.token === "string") sessionStorage.setItem(KEY, json.token);
    } catch {
      /* the first request says to open a new link */
    }
  }
  return step ? { step } : {};
}

export function token(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** A page of a planned file's full text (`plan.file`), from the plan with that hash. */
export interface PlanFilePage {
  path: string;
  offset: number;
  total: number;
  content: string;
  next?: number;
}

export const readPlanFile = (hash: string, file: string, offset = 0) => call<PlanFilePage>("plan.file", { hash, path: file, offset });

/** One wizard op: `{v, op, …}` to `/api`. Throws SettingsProtocolError with the host's message. */
export async function call<T>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  const t = token();
  if (!t) throw new SettingsProtocolError("unauthenticated", "This page has no session: open the link genesis setup printed (each link works once; run it again for a new one).");
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
  askSecrets(names: readonly string[], plan?: SettingsPlan): Promise<Record<string, string> | null>;
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
export async function changeSetting(key: string, change: { value: unknown; locked?: boolean } | { clear: true }, approvals: Approvals) {
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
    async setValue({ key, value, layer, locked }) {
      if (layer !== "file") throw new SettingsProtocolError("unsupported", "The wizard writes genesis.config.json; the database layer is the app's own Settings screen.");
      // The lock travels with the value: a save that changes only the lock is planned as that.
      await changeSetting(key, { value, ...(locked !== undefined ? { locked } : {}) }, approvals);
    },
    async clearValue({ key, layer }) {
      if (layer !== "file") throw new SettingsProtocolError("unsupported", "The wizard writes genesis.config.json; the database layer is the app's own Settings screen.");
      await changeSetting(key, { clear: true }, approvals);
    },
  };
}

/**
 * Check a guided step live (`step.verify`). Its secrets, when it has some, are asked for first,
 * sent with this one request and forgotten: the wizard never keeps them between runs.
 */
export async function verifyStep(id: string, fields: Record<string, string>, needs: readonly string[], approvals: Approvals) {
  let secrets: Record<string, string> | null = null;
  if (needs.length) {
    secrets = await approvals.askSecrets(needs);
    if (!secrets) throw new CancelledError();
  }
  try {
    return (await call<{ result: { verified: boolean; message?: string } }>("step.verify", { id, fields, ...(secrets ? { secrets } : {}) })).result;
  } finally {
    if (secrets) for (const k of Object.keys(secrets)) secrets[k] = "";
  }
}

/** Run a guided step: plan it with the person's values, show the plan, then apply (its secrets asked for there). */
export async function runStep(id: string, fields: Record<string, string>, approvals: Approvals) {
  const { plan } = await call<{ plan: SettingsPlan }>("step.submit", { id, fields });
  if (!(await approvals.confirmPlan(plan))) throw new CancelledError();
  return applyPlan(plan, approvals);
}
