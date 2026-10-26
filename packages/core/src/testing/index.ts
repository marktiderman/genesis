// ---------------------------------------------------------------------------
// Contract test kit (README "Test your data contract")
//
// Checks an app's own provider keeps the Genesis data rules, run against the
// app's real schema (a local Supabase in CI): a write the user may not make is
// refused in plain words, a column only the server sets stays as it was, a
// private value never shows, a binned delete keeps the row. The pgTAP half is
// genesis-supabase's `genesis_testing`; both use the same fixture people.
//
// Every check passes only on evidence and throws a ContractError otherwise, so
// it works in vitest, jest or node:test alike. A wrong resource, a missing row
// or a typo fails the check instead of passing it.
// ---------------------------------------------------------------------------

import type { BaseRecord, DataProvider, Identifier } from "../provider/types";
import { isDataReadError } from "../schema/read-outcome";
import { isDataWriteError, type DataWriteError } from "../schema/write-outcome";

/** The shared fixture logins, the same ids `genesis_testing.user_id()` uses. */
export const FIXTURE_USERS = {
  owner: "00000000-0000-4000-8000-000000000001",
  staff: "00000000-0000-4000-8000-000000000002",
  client: "00000000-0000-4000-8000-000000000003",
  stranger: "00000000-0000-4000-8000-000000000004",
} as const;

export type FixtureUser = keyof typeof FIXTURE_USERS;

/** A broken contract: the message says what happened instead. */
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

/**
 * A signed access token for a fixture person (or any user id), for a test
 * database's legacy JWT secret. Hand it to the client as
 * `Authorization: Bearer <token>`; `auth.uid()` then reads that user. Test
 * databases only: never give it a production secret.
 */
export async function fixtureAccessToken(
  user: FixtureUser | string,
  options: { secret: string; expiresInSeconds?: number; role?: string },
): Promise<string> {
  const sub = Object.hasOwn(FIXTURE_USERS, user) ? FIXTURE_USERS[user as FixtureUser] : user;
  const now = Math.floor(Date.now() / 1000);
  const role = options.role ?? "authenticated";
  const claims = { sub, role, aud: role, iat: now, exp: now + (options.expiresInSeconds ?? 3600) };
  const encode = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const text = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
  const body = `${text({ alg: "HS256", typ: "JWT" })}.${text(claims)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(options.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${encode(new Uint8Array(signature))}`;
}

/** Raw database text that must never reach a person. */
const RAW_TEXT =
  /violates|constraint|duplicate key|row-level security|permission denied for|relation "|syntax error|null value in column|\b(?:42501|42P01|42703|23505|23503|23502|23514|22P02|P0001|PGRST[0-9]{3})\b/i;

/** The error's message is plain words: no raw database text or error codes. */
export function expectPlainMessage(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.trim()) throw new ContractError("the error has no message to show");
  if (RAW_TEXT.test(message)) throw new ContractError(`the message shows raw database text: ${message}`);
}

/** Codes that are refusals: insufficient privilege (RLS, grants) and a guard's `raise exception`. */
const REFUSAL_CODES = new Set(["42501", "P0001"]);

/**
 * Whether a failed write is a refusal: a refusal code (42501, P0001), or the
 * provider's own `forbidden` (the row is still visible but unchanged) or
 * `unauthenticated`. `gone` is not: it also means the id matched nothing.
 */
export function isRefusal(error: unknown): error is DataWriteError {
  if (!isDataWriteError(error)) return false;
  if (error.code !== undefined && REFUSAL_CODES.has(error.code)) return true;
  return error.outcome === "forbidden" || error.outcome === "unauthenticated";
}

const describeError = (error: unknown) =>
  isDataWriteError(error) || isDataReadError(error)
    ? `${error.outcome}${error.code ? ` (${error.code})` : ""}: ${error.message}`
    : String(error);

/**
 * The write is refused, in plain words: a refusal code (42501, P0001) or the
 * provider's `forbidden` / `unauthenticated`. A write that reaches no row
 * (`gone`) counts only with `control`: a run of the same write by someone who
 * may make it (an owner, the service role) that must succeed, so a typo'd id
 * or resource can't pass. The control's write is real: run it on test data.
 * Returns the refusal for more checks.
 */
export async function expectRefused(
  write: Promise<unknown>,
  options: { control?: () => Promise<unknown> } = {},
): Promise<DataWriteError> {
  let result: unknown;
  try {
    result = await write;
  } catch (error) {
    if (isRefusal(error)) {
      expectPlainMessage(error);
      return error;
    }
    if (isDataWriteError(error) && error.outcome === "gone") {
      if (!options.control) {
        throw new ContractError(
          `it reached no row (${error.message}); pass a control that can make the same write, or it could be a wrong id`,
        );
      }
      try {
        await options.control();
      } catch (controlError) {
        throw new ContractError(`the control failed too (${describeError(controlError)}): nothing was refused`);
      }
      expectPlainMessage(error);
      return error;
    }
    throw new ContractError(`it failed, but not as a refusal: ${describeError(error)}`);
  }
  throw new ContractError(`it was allowed: ${JSON.stringify(result)?.slice(0, 300)}`);
}

/** The write succeeds. Returns what it resolved to. */
export async function expectAllowed<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    throw new ContractError(`it was refused: ${describeError(error)}`);
  }
}

const stable = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

/**
 * A client can't change a column only the server sets. First `system` (the
 * service role, or whoever the server writes as) sets `field` to `value` and
 * must change the stored value, then puts it back: that proves the row exists
 * and the value can change at all. Then `as` tries the same update, and the
 * stored value must stay as it was, whether the update was refused, reached
 * no row, or a trigger put the value back. Any other error fails.
 */
export async function expectServerOwned(args: {
  as: DataProvider;
  system: DataProvider;
  resource: string;
  id: Identifier;
  field: string;
  value: unknown;
}): Promise<void> {
  const { as, system, resource, id, field, value } = args;
  const read = async () => {
    const row = (await system.getOne<BaseRecord>(resource, { id })).data;
    if (!row || !(field in row)) throw new ContractError(`${resource} ${String(id)} has no field ${field}`);
    return row[field];
  };
  const before = await read();
  if (stable(before) === stable(value)) {
    throw new ContractError(`${field} is already ${stable(value)}: try a different value`);
  }
  const set = async (to: unknown, what: string) => {
    try {
      await system.update(resource, { id, data: { [field]: to } });
    } catch (error) {
      throw new ContractError(`the system couldn't ${what} ${field} (${describeError(error)}): nothing was tested`);
    }
  };
  await set(value, "set");
  const changed = await read();
  await set(before, "put back");
  if (stable(changed) === stable(before)) {
    throw new ContractError(`the system couldn't change ${field} either: nothing was tested`);
  }
  if (stable(await read()) !== stable(before)) {
    throw new ContractError(`the system couldn't put ${field} back to ${stable(before)}`);
  }
  try {
    await as.update(resource, { id, data: { [field]: value } });
  } catch (error) {
    if (!isRefusal(error) && !(isDataWriteError(error) && error.outcome === "gone")) {
      throw new ContractError(`setting ${field} failed, but not as a refusal: ${describeError(error)}`);
    }
  }
  const after = await read();
  if (stable(after) !== stable(before)) {
    throw new ContractError(`${resource}.${field} changed from ${stable(before)} to ${stable(after)}`);
  }
}

/**
 * `marker` (a value only a private row holds) appears nowhere in what the read
 * returns: use a list or report read that returns the rows around the private
 * one. A refused read (42501, or `forbidden` / `unauthenticated`) shows
 * nothing and passes; any other failure fails, `gone` included, so a wrong id
 * or a broken query can't pass.
 */
export async function expectNeverShows(read: Promise<unknown>, marker: string): Promise<void> {
  if (!marker) throw new ContractError("give a marker to look for");
  let result: unknown;
  try {
    result = await read;
  } catch (error) {
    const refused =
      (isDataReadError(error) || isDataWriteError(error)) &&
      ((error.code !== undefined && REFUSAL_CODES.has(error.code)) ||
        error.outcome === "forbidden" ||
        error.outcome === "unauthenticated");
    if (refused) return;
    throw new ContractError(`the read failed: ${describeError(error)}`);
  }
  const text = JSON.stringify(result) ?? "";
  const escaped = JSON.stringify(marker).slice(1, -1);
  if (text.includes(marker) || text.includes(escaped)) {
    throw new ContractError(`"${marker}" appears in: ${text.slice(0, 300)}`);
  }
}

/** The read returns exactly `expected` rows (a list result, a getMany result or an array). */
export async function expectSees(read: Promise<unknown>, expected: number): Promise<void> {
  let result: unknown;
  try {
    result = await read;
  } catch (error) {
    throw new ContractError(`the read failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && Array.isArray((result as { data?: unknown }).data)
      ? (result as { data: unknown[] }).data
      : undefined;
  if (!rows) throw new ContractError(`the read returned no rows to count: ${JSON.stringify(result)?.slice(0, 300)}`);
  if (rows.length !== expected) throw new ContractError(`saw ${rows.length} row(s), expected ${expected}`);
}

/**
 * A delete on a recycle-bin table moves the row to the bin: `as` deletes it,
 * can no longer read it (gone or forbidden), and `inBin` (a check with the
 * service role or a bin query) confirms the row is still stored.
 */
export async function expectBinned(args: {
  as: DataProvider;
  resource: string;
  id: Identifier;
  inBin: () => Promise<boolean>;
}): Promise<void> {
  const { as, resource, id, inBin } = args;
  // Visible first, so "can't read it back" is evidence of the delete.
  try {
    await as.getOne(resource, { id });
  } catch (error) {
    throw new ContractError(`${resource} ${String(id)} isn't visible before the delete: ${describeError(error)}`);
  }
  await expectAllowed(as.deleteOne(resource, { id }));
  try {
    await as.getOne(resource, { id });
  } catch (error) {
    if (!isDataReadError(error) || (error.outcome !== "gone" && error.outcome !== "forbidden")) {
      throw new ContractError(`reading it back failed: ${describeError(error)}`);
    }
    if (!(await inBin())) throw new ContractError(`${resource} ${String(id)} was deleted for good, not binned`);
    return;
  }
  throw new ContractError(`${resource} ${String(id)} is still visible after the delete`);
}
