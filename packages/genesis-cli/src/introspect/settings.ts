// Where `genesis introspect` writes and what it reads: a flag wins, then the app's
// `doctor.contracts` settings (the same ones the doctor's contract check uses), then
// what the contract on disk says it was made from, then the defaults. So
// `genesis introspect` with no flags rewrites the contract `contracts-stale` checks,
// from the same schemas.
import * as path from "node:path";
import { DEFAULT_CONTRACT_OUT, DEFAULT_DATABASE_ENV, contractSource, sourceSchemas } from "../doctor/contracts.js";
import type { ContractsConfig } from "../doctor/types.js";

/** The flags as given; undefined when left out. */
export interface IntrospectFlags {
  out?: string;
  schema?: string;
  databaseEnv?: string;
  openapi?: string;
}

export interface IntrospectSettings {
  /** Absolute path of the contract file. */
  target: string;
  /** How to name it in messages: as given. */
  label: string;
  schemas: string[];
  databaseEnv: string;
}

/**
 * @param root the app's root, where the command runs: `-o` and `contracts.out` are both
 *   relative to it, as the doctor resolves `contracts.out`
 * @param contracts the app's `doctor.contracts`, when its config sets one
 * @param readCurrent reads the contract on disk (null when there is none), for the schemas its
 *   `// Source: Postgres (…)` line names
 */
export function introspectSettings(
  flags: IntrospectFlags,
  root: string,
  contracts?: ContractsConfig,
  readCurrent: (file: string) => string | null = () => null,
): IntrospectSettings {
  const out = flags.out ?? contracts?.out ?? DEFAULT_CONTRACT_OUT;
  const target = path.resolve(root, out);
  return { target, label: out, schemas: schemasFor(flags, target, contracts, readCurrent), databaseEnv: flags.databaseEnv ?? contracts?.databaseEnv ?? DEFAULT_DATABASE_ENV };
}

function schemasFor(flags: IntrospectFlags, target: string, contracts: ContractsConfig | undefined, readCurrent: (file: string) => string | null): string[] {
  if (flags.schema !== undefined) return flags.schema.split(",").map((s) => s.trim()).filter(Boolean);
  // An OpenAPI document is read one schema at a time: only a single configured schema carries over.
  if (flags.openapi !== undefined) return contracts?.schemas?.length === 1 ? [...contracts.schemas] : ["public"];
  if (contracts?.schemas?.length) return [...contracts.schemas];
  return sourceSchemas(contractSource(readCurrent(target) ?? "")) ?? ["public"];
}
