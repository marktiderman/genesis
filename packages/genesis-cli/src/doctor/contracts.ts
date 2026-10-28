/**
 * `contracts-stale` (supabase pack): the generated contract on disk is what
 * `genesis introspect` would write from the database now, the same comparison
 * as `genesis introspect --check`. Set `doctor.contracts` to turn it on; it
 * reads the database URL from `databaseEnv` (default DATABASE_URL) and says it
 * skipped when that isn't set, so a build without a database never fails on it.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { DoctorContext } from "./types.js";

export const DEFAULT_CONTRACT_OUT = "resources.genesis.ts";
export const DEFAULT_DATABASE_ENV = "DATABASE_URL";

/** The `source` line `genesis introspect` writes for a Postgres read. Shared so the check and the command agree. */
export const postgresSource = (schemas: readonly string[]) => `Postgres (${schemas.join(", ")})`;

/** The contract `genesis introspect` writes for these schemas, read from Postgres. */
export async function postgresContract(url: string, schemas: string[]): Promise<{ content: string; tables: number }> {
  const { introspectPostgres, emitContracts } = await import("../introspect/index.js");
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const tables = await introspectPostgres(sql, schemas);
    return { content: emitContracts(tables, { source: postgresSource(schemas) }), tables: tables.length };
  } finally {
    await sql.end();
  }
}

/** Test seam: what reads the contract from the database. */
export type ContractReader = (url: string, schemas: string[]) => Promise<{ content: string }>;

/** The `// Source:` line a generated contract carries, or null. */
export function contractSource(content: string): string | null {
  return /^\/\/ Source: (.*)$/m.exec(content.slice(0, 2000))?.[1]?.trim() ?? null;
}

const lf = (text: string) => text.replace(/\r\n/g, "\n");

export async function checkContracts(ctx: DoctorContext, read: ContractReader = postgresContract): Promise<void> {
  const settings = ctx.config.contracts;
  if (!settings) return;
  const out = settings.out ?? DEFAULT_CONTRACT_OUT;
  const schemas = settings.schemas?.length ? settings.schemas : ["public"];
  const env = settings.databaseEnv ?? DEFAULT_DATABASE_ENV;
  let current: string | null = null;
  try {
    current = lf(readFileSync(path.join(ctx.root, out), "utf8"));
  } catch {
    current = null;
  }
  // Only a contract read from Postgres can be re-read here; one from an OpenAPI document needs its URL and key.
  const source = current === null ? null : contractSource(current);
  if (source !== null && !source.startsWith("Postgres (")) {
    ctx.report({ rule: "contracts-stale", level: "info", file: out, message: `not checked: it was generated from ${source.split(" ")[0]}, and the doctor compares only contracts read from Postgres; check it with genesis introspect --check and the same source` });
    return;
  }
  const url = process.env[env];
  if (!url) {
    ctx.report({ rule: "contracts-stale", level: "info", file: out, message: `not checked: set ${env} to the database URL to compare it with the database (as genesis introspect --check)` });
    return;
  }
  let expected: string;
  try {
    expected = lf((await read(url, schemas)).content);
  } catch (err) {
    ctx.report({ rule: "contracts-stale", level: "warn", file: out, message: `couldn't read the database through ${env}: ${(err as Error).message.split("\n")[0]}` });
    return;
  }
  if (current !== expected) {
    ctx.report({
      rule: "contracts-stale",
      file: out,
      message: current === null ? `doesn't exist; run genesis introspect -o ${out} -s ${schemas.join(",")} and commit it` : `is out of date with the database; run genesis introspect -o ${out} -s ${schemas.join(",")} and commit the result`,
    });
  }
}
