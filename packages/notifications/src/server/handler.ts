/**
 * `createNotificationsHandler`: the notifier's HTTP surface, as a
 * `(Request) => Promise<Response>` for an Edge Function, a worker or any
 * server with Fetch API requests. Matched by the path's last segments, so
 * it mounts under any prefix:
 *
 *   POST …/run                 send what is due        (Authorization: Bearer <cronSecret>)
 *   POST …/receipts            check push receipts     (Authorization: Bearer <cronSecret>)
 *   POST …/webhooks/resend     bounces, complaints, deliveries (Svix-signed)
 *   GET  …/unsubscribe?t=…     a page with one button (GET never unsubscribes: link scanners follow links)
 *   POST …/unsubscribe?t=…     unsubscribes; RFC 8058 one-click posts `List-Unsubscribe=One-Click` here
 *
 * Answers carry counts and statuses only.
 */
import { timingSafeEqual } from "./crypto";
import { escapeHtml } from "./email-render";
import type { NotificationRunner } from "./runner";
import type { NotificationStore } from "./store";
import { verifyUnsubscribeToken } from "./unsubscribe";
import { emailEventOf, verifyResendWebhook } from "./webhook";

export interface NotificationsHandlerOptions {
  runner: NotificationRunner;
  store: NotificationStore;
  /** The bearer secret a scheduler sends to /run and /receipts (32 characters or more). */
  cronSecret: string;
  /** The unsubscribe signing secret (the runner's `email.unsubscribe.secret`). */
  unsubscribeSecret?: string;
  /** Resend's webhook signing secret (`whsec_…`). */
  resendWebhookSecret?: string;
  /** Words on the unsubscribe page. */
  copy?: Partial<{ title: string; confirm: string; button: string; done: string; invalid: string }>;
  log?: (message: string) => void;
}

const COPY = {
  title: "Unsubscribe",
  confirm: "Stop getting these emails?",
  button: "Unsubscribe",
  done: "You're unsubscribed. You won't get these emails any more.",
  invalid: "This link isn't valid any more.",
};

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">${body}</body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/**
 * The handler.
 *
 * @stability Beta
 */
export function createNotificationsHandler(options: NotificationsHandlerOptions): (request: Request) => Promise<Response> {
  if (!options.cronSecret || options.cronSecret.length < 32) throw new Error("createNotificationsHandler: cronSecret must be at least 32 characters");
  const copy = { ...COPY, ...options.copy };
  const enc = new TextEncoder();
  const authorized = (request: Request) => {
    const header = request.headers.get("authorization") ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : "";
    return timingSafeEqual(enc.encode(given), enc.encode(options.cronSecret));
  };
  const log = (m: string) => {
    try {
      options.log?.(m);
    } catch {
      // ignored
    }
  };

  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    try {
      if (path.endsWith("/run") || path.endsWith("/receipts")) {
        if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
        if (!authorized(request)) return json({ error: "unauthorized" }, 401);
        if (path.endsWith("/run")) return json({ ok: true, ...(await options.runner.run({ signal: request.signal })) });
        return json({ ok: true, ...(await options.runner.checkReceipts({ signal: request.signal })) });
      }

      if (path.endsWith("/webhooks/resend")) {
        if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
        if (!options.resendWebhookSecret) return json({ error: "not_configured" }, 404);
        const body = await request.text();
        if (body.length > 256_000 || !(await verifyResendWebhook(options.resendWebhookSecret, request.headers, body))) return json({ error: "bad_signature" }, 401);
        let payload: unknown;
        try {
          payload = JSON.parse(body);
        } catch {
          return json({ error: "bad_json" }, 400);
        }
        const event = emailEventOf(payload);
        if (!event) return json({ ok: true, ignored: true });
        const ours = await options.store.emailEvent(event.providerId, event.event, event.permanent);
        return json({ ok: true, ours });
      }

      if (path.endsWith("/unsubscribe")) {
        if (!options.unsubscribeSecret) return page(copy.title, `<p>${escapeHtml(copy.invalid)}</p>`, 404);
        const token = url.searchParams.get("t") ?? "";
        const claims = await verifyUnsubscribeToken(options.unsubscribeSecret, token);
        if (!claims) return page(copy.title, `<p>${escapeHtml(copy.invalid)}</p>`, 400);
        if (request.method === "GET") {
          const action = `${url.pathname}?t=${encodeURIComponent(token)}`;
          return page(
            copy.title,
            `<h1 style="font-size:1.25rem">${escapeHtml(copy.confirm)}</h1><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit" style="font-size:1rem;padding:.5rem 1rem">${escapeHtml(copy.button)}</button></form>`,
          );
        }
        if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
        await options.store.unsubscribe(claims.userId ?? null, claims.userId ? null : (claims.email ?? null), claims.category);
        return page(copy.title, `<p>${escapeHtml(copy.done)}</p>`);
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      log(`notifications handler: ${error instanceof Error ? error.name : "error"} on ${path.split("/").slice(-1)[0]}`);
      return json({ error: "server_error" }, 500);
    }
  };
}
