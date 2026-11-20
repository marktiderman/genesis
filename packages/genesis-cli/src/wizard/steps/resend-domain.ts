/**
 * `resend.domain`: the API key as the Edge Function secret RESEND_API_KEY, and the sending domain
 * added to Resend (or found there) with the DNS records to add. Verified when Resend says the
 * domain is `verified`; until then "Check again" shows the records.
 */
import { defineSetupStep } from "@marktiderman/genesis-config/setup";
import type { SecretVault } from "../../exec/secret-vault.js";
import { needsSecret, OFFLINE, printable, request, secretSetters, StepError, type StepContext, type StepRunner } from "./framework.js";

export const resendDomainStep = defineSetupStep({
  id: "resend.domain",
  title: "Send email through Resend",
  package: "@marktiderman/genesis-notifications",
  tools: ["supabase"],
  needs: [{ name: "RESEND_API_KEY", store: "edge", help: "A Resend API key with Full access, so the step can add the domain." }],
  fields: [{ name: "domain", label: "Sending domain", pattern: "(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}", placeholder: "mail.example.com", help: "A subdomain you control, such as mail.example.com." }],
  links: [
    { label: "Resend API keys", url: "https://resend.com/api-keys" },
    { label: "Resend domains", url: "https://resend.com/domains" },
  ],
  instructions: [
    "Make a Resend API key with Full access. The step asks for it when it runs: it goes to the Supabase Edge Function secrets on stdin and is never shown again.",
    "The step adds the domain to Resend (or finds it) and shows its DNS records: add each at your DNS host.",
    "DNS takes a while. Check again until Resend says the domain is verified.",
  ],
});

const API = "https://api.resend.com";
const ID = /^[A-Za-z0-9-]{1,100}$/;

interface Domain {
  id: string;
  name: string;
  status?: string;
  records?: Array<{ record?: string; type?: string; name?: string; value?: string; priority?: number; status?: string }>;
}

const headers = (key: string) => ({ authorization: `Bearer ${key}`, "content-type": "application/json", "user-agent": "genesis-cli" });

async function call(ctx: StepContext, secrets: SecretVault, path: string, init: { method?: string; body?: string } = {}) {
  const res = await secrets.use("RESEND_API_KEY", (key) => request(ctx, `${API}${path}`, { ...init, headers: headers(key) }));
  if (res.status === 0) throw new StepError(`Resend couldn't be reached: ${res.error ?? "no answer"}`);
  if (res.status === 401 || res.status === 403) throw new StepError(`Resend refused the key (${res.status}): it's wrong, or it hasn't Full access.`);
  if (!res.ok) throw new StepError(`Resend answered ${res.status} for ${init.method ?? "GET"} ${path}.`);
  return res.body;
}

async function findDomain(ctx: StepContext, secrets: SecretVault): Promise<Domain | null> {
  const body = (await call(ctx, secrets, "/domains")) as { data?: Domain[] } | null;
  const hit = (body?.data ?? []).find((d) => d && d.name === ctx.fields.domain);
  if (!hit) return null;
  if (!ID.test(hit.id)) throw new StepError("Resend answered with a domain id that isn't one.");
  return (await call(ctx, secrets, `/domains/${hit.id}`)) as Domain;
}

/** The DNS records to add, one per line. */
export function recordLines(domain: Domain): string[] {
  // Resend's text, printed at a terminal: control characters (ANSI, OSC) stripped.
  const show = (v: unknown) => printable(typeof v === "number" ? String(v) : v) || "?";
  return (domain.records ?? []).map((r) => `${show(r.type)}  ${show(r.name)}  ${show(r.value)}${r.priority !== undefined ? `  (priority ${show(r.priority)})` : ""}${r.status ? `  [${show(r.status)}]` : ""}`);
}

export const resendDomain: StepRunner = {
  step: resendDomainStep,
  plan(ctx) {
    const { commands, manual } = secretSetters(ctx.root, "RESEND_API_KEY", "edge");
    return { summary: `keeps the Resend key as the Edge Function secret RESEND_API_KEY, then adds ${ctx.fields.domain} to Resend (or finds it) and shows its DNS records`, commands, ...(manual.length ? { manual: manual.join("\n") } : {}) };
  },
  async apply(ctx, secrets) {
    if (!ctx.network) return ["The network is off: the domain wasn't added to Resend."];
    let domain = await findDomain(ctx, secrets);
    const notes: string[] = [];
    if (!domain) {
      const made = (await call(ctx, secrets, "/domains", { method: "POST", body: JSON.stringify({ name: ctx.fields.domain }) })) as Domain;
      notes.push(`Added ${ctx.fields.domain} to Resend`);
      domain = made;
    } else notes.push(`${ctx.fields.domain} is already in Resend`);
    const lines = recordLines(domain);
    if (lines.length) notes.push(`Add these DNS records:\n${lines.join("\n")}`);
    return notes;
  },
  async verify(ctx, secrets) {
    if (!ctx.network) return OFFLINE;
    if (!secrets?.has("RESEND_API_KEY")) return needsSecret("RESEND_API_KEY");
    try {
      const domain = await findDomain(ctx, secrets);
      if (!domain) return { ok: false, message: `${ctx.fields.domain} isn't in Resend yet: run the step to add it.` };
      if (domain.status === "verified") return { ok: true, message: `Resend says ${ctx.fields.domain} is verified.` };
      const lines = recordLines(domain);
      return { ok: false, message: `Resend says ${ctx.fields.domain} is ${printable(domain.status) || "not verified"}.${lines.length ? ` Add these DNS records, then check again:\n${lines.join("\n")}` : " Check again in a while."}` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },
};
