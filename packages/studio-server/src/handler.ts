// ---------------------------------------------------------------------------
// The studio handler: a web-standard `Request → Response` function
// (DATA-STUDIO.md decision 6). Mount it on one POST route.
// ---------------------------------------------------------------------------

import { decodeRecordKey } from "@marktiderman/genesis-core/schema";
import { resolveResource, summarize, type AccessContext, type ResolvedResource } from "./access";
import { loadTables } from "./catalog";
import { createPostgresDatabase, IdentitySwitchError, type Query, type StudioDatabase } from "./db";
import type { StudioHandlerOptions } from "./options";
import {
  STUDIO_PROTOCOL_VERSION,
  type ErrorResponse,
  type StudioRequest,
} from "./protocol";
import { BadRequestError, listRows, readRow } from "./rows";
import { updateRow, WriteRejected } from "./write";

export interface StudioHandler {
  (request: Request): Promise<Response>;
  /** Close the database pool (tests, graceful shutdown). */
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 1_000_000;
/** Deepest row a list may page to. Past this, filter or search instead. */
const MAX_OFFSET = 100_000;

const STATUS: Record<ErrorResponse["error"]["outcome"], number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  gone: 410,
  invalid: 422,
  audit_failed: 500,
  error: 500,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fail(
  outcome: ErrorResponse["error"]["outcome"],
  message: string,
  extra: Pick<ErrorResponse["error"], "current" | "currentVersion"> = {},
): Response {
  return json({ error: { outcome, message, ...extra } } satisfies ErrorResponse, STATUS[outcome]);
}

class NotFoundError extends Error {}

/** Read at most MAX_BODY_BYTES, counting bytes, even without a content-length. */
async function readText(request: Request): Promise<string> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new BadRequestError("Request body is too large.");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BadRequestError("Request body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readBody(request: Request): Promise<StudioRequest & { v?: number }> {
  const text = await readText(request);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new BadRequestError("Request body must be JSON.");
  }
  if (!body || typeof body !== "object" || typeof (body as { op?: unknown }).op !== "string") {
    throw new BadRequestError('Request body must be an object with an "op".');
  }
  return body as StudioRequest & { v?: number };
}

function resourceName(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new BadRequestError('"resource" must be a "schema.table" name.');
  }
  return value;
}

function positiveInt(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new BadRequestError(`"${name}" must be a positive integer.`);
  }
  return value;
}

function recordId(value: unknown): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  throw new BadRequestError('"id" must be a string or a number.');
}

/**
 * Refuse a browser request from another site. The bearer token already stops
 * classic CSRF, but an app that swaps in cookie-based `auth` would otherwise
 * be open to it. Requests with no `Origin` (servers, scripts) pass: the token
 * is still required.
 */
function crossSiteRefusal(request: Request, allowed: readonly string[]): string | null {
  const origin = request.headers.get("origin");
  if (!origin || allowed.includes(origin)) return null;
  if (origin === "null") return "Requests from an opaque origin are refused.";
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return "Malformed Origin header.";
  }
  const own = [
    new URL(request.url).host,
    request.headers.get("host"),
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
  ];
  return own.includes(host) ? null : `Requests from ${origin} aren't allowed. Add it to allowedOrigins.`;
}

function decodeKey(resolved: ResolvedResource, id: string | number): Record<string, unknown> {
  try {
    return decodeRecordKey(resolved.schema, id);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Create the handler. It opens one transaction per request, switches to the
 * signed-in user (`set local role` plus their verified claims), and only
 * then reads the catalog or touches a row, so the database's own privileges
 * and row rules always apply.
 *
 * @example Next.js — `app/api/studio/route.ts`
 * ```ts
 * export const POST = createStudioHandler({
 *   database: process.env.STUDIO_DATABASE_URL!,
 *   auth: supabaseAuth({ url: process.env.NEXT_PUBLIC_SUPABASE_URL! }),
 *   authorize: byResource({ "public.clients": { read: true, update: ["notes"] } }),
 *   audit: { sink: "table" },
 * });
 * ```
 */
export function createStudioHandler(options: StudioHandlerOptions): StudioHandler {
  const database: StudioDatabase =
    typeof options.database === "string" ? createPostgresDatabase(options.database) : options.database;
  const role = options.role ?? "authenticated";
  const schemas = options.schemas ?? ["public"];
  const statementTimeoutMs = options.statementTimeoutMs ?? 10_000;
  const maxPageSize = options.maxPageSize ?? 200;

  // Checked once, on the first request: the login role must not be able to
  // see past row rules on its own.
  let loginCheck: Promise<string | null> | undefined;
  const checkLogin = () =>
    (loginCheck ??= database.inspectLogin().then((login) => {
      if (options.allowPrivilegedLogin) return null;
      if (login.superuser || login.bypassRls) {
        return (
          `The studio's database login "${login.name}" is a superuser or bypasses row-level security. ` +
          "Connect with a dedicated NOINHERIT login role (see the README), or set allowPrivilegedLogin for local development."
        );
      }
      return null;
    }));

  async function resolveOne(ctx: AccessContext, query: Query, name: string): Promise<ResolvedResource> {
    const tables = await loadTables(query, schemas, name);
    // Two tables can only share a dotted name if a schema name has a dot in
    // it; refuse rather than guess which one was meant.
    const table = tables.length === 1 ? tables[0] : undefined;
    const resolved = table ? await resolveResource(ctx, table) : null;
    // A table this user may not see gets the same answer as one that does
    // not exist, so the response never confirms a hidden table's existence.
    if (!resolved) throw new NotFoundError(`No resource "${name}".`);
    return resolved;
  }

  const handler = async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    }
    try {
      const refusal = crossSiteRefusal(request, options.allowedOrigins ?? []);
      if (refusal) return fail("forbidden", refusal);
      // Only JSON: a cross-site form can't send it without a preflight.
      const type = request.headers.get("content-type") ?? "";
      if (!/^application\/json\b/i.test(type)) {
        return new Response(JSON.stringify({ error: { outcome: "bad_request", message: "Send application/json." } }), {
          status: 415,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      }

      // Who is asking, before reading anything they sent.
      const claims = await options.auth(request);
      if (!claims) return fail("unauthenticated", "Sign in to use the studio.");
      if (claims.role !== undefined && claims.role !== role) {
        // e.g. a service-role key: the studio only ever acts as a signed-in user.
        return fail("forbidden", "This token doesn't belong to a signed-in user.");
      }
      if (claims.is_anonymous === true && !options.allowAnonymousUsers) {
        return fail("forbidden", "Anonymous sessions can't use the studio. Sign in with an account.");
      }

      const loginProblem = await checkLogin();
      if (loginProblem) {
        options.onError?.(new Error(loginProblem));
        return fail("error", "The studio isn't set up safely, so it's switched off. Your administrator has the details.");
      }

      const body = await readBody(request);
      if (body.v !== undefined && body.v !== STUDIO_PROTOCOL_VERSION) {
        throw new BadRequestError(
          `This server speaks studio protocol v${STUDIO_PROTOCOL_VERSION}; the client sent v${String(body.v)}.`,
        );
      }

      const readOnly = body.op !== "update";
      const result = await database.asUser({ role, claims }, { readOnly, statementTimeoutMs }, async (query) => {
        const ctx: AccessContext = { request, claims, query, options };
        switch (body.op) {
          case "resources": {
            const tables = await loadTables(query, schemas);
            const resources = [];
            for (const table of tables) {
              const resolved = await resolveResource(ctx, table);
              if (resolved) resources.push(summarize(resolved));
            }
            return { resources };
          }
          case "describe": {
            const resolved = await resolveOne(ctx, query, resourceName(body.resource));
            return { schema: resolved.schema };
          }
          case "list": {
            const resolved = await resolveOne(ctx, query, resourceName(body.resource));
            const perPage = positiveInt(body.perPage, 25, "perPage");
            if (perPage > maxPageSize) throw new BadRequestError(`"perPage" may be at most ${maxPageSize}.`);
            const page = positiveInt(body.page, 1, "page");
            if ((page - 1) * perPage > MAX_OFFSET) {
              throw new BadRequestError(`Pages past row ${MAX_OFFSET} aren't served. Narrow the list with a search or filter.`);
            }
            return listRows(query, resolved, {
              page,
              perPage,
              sort: body.sort,
              search: typeof body.search === "string" ? body.search : undefined,
              filters: Array.isArray(body.filters) ? body.filters : undefined,
            });
          }
          case "read": {
            const name = resourceName(body.resource);
            const resolved = await resolveOne(ctx, query, name);
            const row = await readRow(query, resolved, decodeKey(resolved, recordId(body.id)));
            if (!row) throw new NotFoundError("No such row, or you can't see it.");
            return { row };
          }
          case "update": {
            const name = resourceName(body.resource);
            const resolved = await resolveOne(ctx, query, name);
            if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
              throw new BadRequestError('"data" must be an object of field → value.');
            }
            if (body.expectedVersion !== null && typeof body.expectedVersion !== "string") {
              throw new BadRequestError('"expectedVersion" must be the version token the row was read at, or null.');
            }
            return updateRow(query, resolved, {
              key: decodeKey(resolved, recordId(body.id)),
              data: body.data,
              expectedVersion: body.expectedVersion,
              resourceName: name,
            });
          }
          default:
            throw new BadRequestError(`Unknown op "${String((body as { op: unknown }).op)}".`);
        }
      });
      return json(result);
    } catch (error) {
      if (error instanceof WriteRejected) {
        return fail(error.outcome, error.message, {
          ...(error.current ? { current: error.current, currentVersion: error.currentVersion ?? null } : {}),
        });
      }
      if (error instanceof BadRequestError) return fail("bad_request", error.message);
      if (error instanceof NotFoundError) return fail("not_found", error.message);
      options.onError?.(error);
      if (error instanceof IdentitySwitchError) return fail("error", "The studio couldn't switch to your identity.");
      return fail("error", "Something went wrong. Nothing was changed.");
    }
  };

  return Object.assign(handler, { close: () => database.end() });
}
