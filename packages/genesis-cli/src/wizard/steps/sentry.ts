/**
 * `sentry`: the project and its DSN, and the auth token CI uploads source maps with
 * (SENTRY_AUTH_TOKEN: GitHub Actions through `gh secret set` on stdin; EAS by hand, since
 * `eas env:create` has no stdin path). Verified by reading the project with the token, and by
 * sending one test event to the DSN when it is given.
 */
import { randomUUID } from "node:crypto";
import { defineSetupStep } from "./define.js";
import { needsSecret, OFFLINE, request, secretSetters, type StepContext, type StepRunner } from "./framework.js";

const SLUG = "[a-z0-9][a-z0-9_-]{0,99}";
/** sentry.io only (no self-hosted Sentry): its ingest hosts are subdomains of sentry.io, so no private or loopback host gets the test event. */
const DSN = /^https:\/\/([0-9a-f]{16,64})@((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*sentry\.io)\/(\d+)$/;

export const sentryStep = defineSetupStep({
  id: "sentry",
  title: "Report errors to Sentry",
  tools: ["gh"],
  needs: [{ name: "SENTRY_AUTH_TOKEN", store: "ci", help: "An organization auth token (Settings → Auth Tokens)." }],
  fields: [
    { name: "org", label: "Organization slug", pattern: SLUG, placeholder: "your-org" },
    { name: "project", label: "Project slug", pattern: SLUG, placeholder: "your-app" },
    { name: "dsn", label: "DSN", pattern: DSN.source.slice(1, -1), placeholder: "https://<key>@o0.ingest.sentry.io/0", optional: true, help: "Project Settings → Client Keys (DSN). Public: it ships in the app. Used to send the test event; put it in the app's Sentry setup yourself." },
  ],
  links: [
    { label: "Sentry: new project", url: "https://sentry.io/projects/new/" },
    { label: "Sentry: auth tokens", url: "https://docs.sentry.io/account/auth-tokens/" },
  ],
  instructions: [
    "Make a project in Sentry for the app (the platform you ship: React Native, or JavaScript for the web).",
    "Copy its DSN: Project Settings → Client Keys.",
    "Make an organization auth token (Settings → Auth Tokens). CI uploads source maps with it; the step asks for it when it runs and never shows it again.",
  ],
});

export const sentry: StepRunner = {
  step: sentryStep,
  plan(ctx) {
    const { commands, manual } = secretSetters(ctx.root, "SENTRY_AUTH_TOKEN", "ci");
    return { summary: `keeps the Sentry auth token for ${ctx.fields.org}/${ctx.fields.project} as the CI secret SENTRY_AUTH_TOKEN`, commands, ...(manual.length ? { manual: manual.join("\n") } : {}) };
  },
  async verify(ctx, secrets) {
    if (!ctx.network) return OFFLINE;
    if (!secrets?.has("SENTRY_AUTH_TOKEN")) return needsSecret("SENTRY_AUTH_TOKEN");
    const { org, project } = ctx.fields;
    const res = await secrets.use("SENTRY_AUTH_TOKEN", (token) => request(ctx, `https://sentry.io/api/0/projects/${org}/${project}/`, { headers: { authorization: `Bearer ${token}` } }));
    if (res.status === 0) return { ok: false, message: `Sentry couldn't be reached: ${res.error ?? "no answer"}` };
    if (res.status === 401 || res.status === 403) return { ok: false, message: `Sentry refused the token (${res.status}): it's wrong, expired, or can't read ${org}/${project}.` };
    if (res.status === 404) return { ok: false, message: `No project ${org}/${project} the token can see (404).` };
    if (!res.ok) return { ok: false, message: `Sentry answered ${res.status} for ${org}/${project}.` };
    if (!ctx.fields.dsn) return { ok: true, message: `The token reads ${org}/${project}. (No DSN given, so no test event was sent.)` };
    const event = await sendTestEvent(ctx, ctx.fields.dsn);
    return event.ok ? { ok: true, message: `The token reads ${org}/${project}, and a test event reached the DSN.` } : event;
  },
};

/** One info-level event, as an envelope, to the DSN's ingest endpoint. The DSN's key is public. */
export async function sendTestEvent(ctx: StepContext, dsn: string): Promise<{ ok: boolean; message: string }> {
  const m = DSN.exec(dsn);
  if (!m) return { ok: false, message: "The DSN doesn't look like https://<key>@<…>.sentry.io/<project id> (self-hosted Sentry isn't supported)." };
  const [, key, host, id] = m;
  const eventId = randomUUID().replace(/-/g, "");
  const body = [JSON.stringify({ event_id: eventId, dsn }), JSON.stringify({ type: "event" }), JSON.stringify({ event_id: eventId, message: "genesis setup: test event", level: "info", platform: "javascript" })].join("\n");
  const res = await request(ctx, `https://${host}/api/${id}/envelope/`, { method: "POST", headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=genesis-cli/1` }, body });
  if (res.ok) return { ok: true, message: "A test event reached the DSN." };
  return { ok: false, message: res.status === 0 ? `The DSN's host couldn't be reached: ${res.error ?? "no answer"}` : `The DSN refused the test event (${res.status}).` };
}
