/**
 * The genesis-apple-revoke Edge Function's request handling, with its
 * dependencies passed in (index.ts wires the real ones), so it is tested
 * without Deno, a database or Apple.
 *
 *   POST { "action": "store", "code": "<authorizationCode>", "clientId"?: "<bundle id>" }
 *     Authorization: Bearer <the person's access token>
 *     Exchanges the code from a Sign in with Apple at /auth/token and keeps
 *     Apple's refresh token against the caller, server-side only.
 *
 *   POST { "action": "revoke" }
 *     Revokes the tokens of deleted accounts that are due (queued by the
 *     delete trigger, retried with backoff). It needs no caller: it only
 *     works through the queue, a bounded batch at a time, and answers
 *     `{ ok: true }` whatever was in it. The app calls it after
 *     `delete_my_account`; a schedule calls it to retry.
 *
 * Responses never carry a token, a secret, or Apple's response body: only an
 * `error` code from the list below.
 */
import { exchangeAuthorizationCode, readAppleConfig, revokeRefreshToken, type AppleConfig } from "./apple.ts";

/** The signed-in caller, as the auth server reports it. */
export interface CallerUser {
  id: string;
  /** The `sub` of each Apple identity linked to this login (Apple's user id). */
  appleUserIds: string[];
}

export interface DueRevocation {
  id: number;
  client_id: string;
  refresh_token: string;
  attempts: number;
}

/** The SQL functions from migration 0003, called with the service role. */
export interface TokenStore {
  /** `genesis_apple_token_save`: "stored", or "queued" when the login is already gone. */
  save(userId: string, clientId: string, refreshToken: string): Promise<"stored" | "queued">;
  /** `genesis_apple_revocations_claim`: due rows, each leased until its next retry. */
  claim(limit: number): Promise<DueRevocation[]>;
  /** `genesis_apple_revocation_done`: forgets a revoked token. */
  done(id: number): Promise<void>;
  /** `genesis_apple_revocation_failed`: keeps the row for its next retry, with why. */
  failed(id: number, error: string): Promise<void>;
}

export interface HandlerDeps {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  /** The user behind an access token (checked with the auth server), or null. */
  getUser(accessToken: string): Promise<CallerUser | null>;
  store: TokenStore;
  log: (message: string) => void;
}

export const REVOKE_BATCH = 20;
const MAX_BODY_BYTES = 4096;
const CODE = /^[A-Za-z0-9._-]{1,1024}$/;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => null);
  if (text === null || text.length > MAX_BODY_BYTES) return null;
  try {
    const body: unknown = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function bearer(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

export async function handle(req: Request, deps: HandlerDeps): Promise<Response> {
  try {
    return await route(req, deps);
  } catch (error) {
    // e.g. APPLE_PRIVATE_KEY isn't a P-256 key, or the database is unreachable.
    deps.log(`genesis-apple-revoke: failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown error"}`);
    return json(500, { error: "internal" });
  }
}

async function route(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const body = await readBody(req);
  if (!body) return json(400, { error: "bad_request" });

  const apple = readAppleConfig(deps.env);
  if (!apple.config) {
    // Loud in the logs, by name only: a missing secret must not pass for a revoked token.
    deps.log(`genesis-apple-revoke: not configured; set ${apple.problems.join(", ")}`);
    return json(500, { error: "not_configured" });
  }

  if (body.action === "store") return store(req, body, apple.config, deps);
  if (body.action === "revoke") {
    await revokeDue(apple.config, deps);
    return json(200, { ok: true });
  }
  return json(400, { error: "bad_request" });
}

async function store(req: Request, body: Record<string, unknown>, config: AppleConfig, deps: HandlerDeps): Promise<Response> {
  const token = bearer(req);
  const user = token ? await deps.getUser(token).catch(() => null) : null;
  if (!user) return json(401, { error: "not_signed_in" });

  const code = body.code;
  if (typeof code !== "string" || !CODE.test(code)) return json(400, { error: "bad_request" });
  const clientId = body.clientId === undefined || body.clientId === null ? config.clientIds[0]! : body.clientId;
  if (typeof clientId !== "string" || !config.clientIds.includes(clientId)) return json(400, { error: "unknown_client" });
  if (user.appleUserIds.length === 0) return json(403, { error: "no_apple_identity" });

  const exchanged = await exchangeAuthorizationCode(config, clientId, code, deps.fetch);
  if (!exchanged.ok) {
    deps.log(`genesis-apple-revoke: code exchange failed for ${clientId}: ${exchanged.error}${exchanged.status ? ` (HTTP ${exchanged.status})` : ""}`);
    return json(502, { error: "exchange_failed", apple: exchanged.error });
  }

  // The code must belong to this login's Apple identity: otherwise someone
  // could file another person's token under their own account.
  if (!user.appleUserIds.includes(exchanged.appleUserId)) {
    // The exchange minted a refresh token we won't keep; revoke it straight away.
    const revoked = await revokeRefreshToken(config, clientId, exchanged.refreshToken, deps.fetch);
    deps.log(`genesis-apple-revoke: a code for another Apple account was refused (its token ${revoked.ok ? "revoked" : `not revoked: ${revoked.error}`})`);
    return json(403, { error: "apple_identity_mismatch" });
  }

  const saved = await deps.store.save(user.id, clientId, exchanged.refreshToken);
  // The login was deleted while this ran: the token went to the queue, so revoke now.
  if (saved === "queued") await revokeDue(config, deps);
  return json(200, { ok: true });
}

/** Works through due revocations. Returns the counts (for logs and tests only). */
export async function revokeDue(config: AppleConfig, deps: HandlerDeps): Promise<{ revoked: number; failed: number }> {
  let revoked = 0;
  let failed = 0;
  let due: DueRevocation[];
  try {
    due = await deps.store.claim(REVOKE_BATCH);
  } catch (error) {
    deps.log(`genesis-apple-revoke: couldn't read the queue: ${error instanceof Error ? error.message : String(error)}`);
    return { revoked, failed };
  }
  for (const row of due) {
    // One row's trouble never stops the rest; a row whose result wasn't
    // recorded comes round again when its lease ends (Apple answers 200 for
    // a token it already revoked).
    try {
      const result = await revokeRefreshToken(config, row.client_id, row.refresh_token, deps.fetch);
      if (result.ok) {
        await deps.store.done(row.id);
        revoked++;
      } else {
        const why = `${result.error}${result.status ? ` (HTTP ${result.status})` : ""}`;
        failed++;
        deps.log(`genesis-apple-revoke: revocation ${row.id} for ${row.client_id} failed (attempt ${row.attempts}): ${why}; it will be retried`);
        await deps.store.failed(row.id, why);
      }
    } catch (error) {
      failed++;
      deps.log(`genesis-apple-revoke: revocation ${row.id} couldn't be recorded: ${error instanceof Error ? error.message : String(error)}; it will be retried`);
    }
  }
  if (due.length) deps.log(`genesis-apple-revoke: ${revoked} revoked, ${failed} to retry`);
  return { revoked, failed };
}
