// Where `genesis introspect` writes and what it reads: a flag wins, then the app's
// `doctor.contracts` settings (the same ones the doctor's contract check uses), then
// the defaults. So `genesis introspect` with no flags keeps the contract the doctor
// checks current, wherever the app keeps it.
import * as path from "node:path";
import { DEFAULT_CONTRACT_OUT } from "../doctor/contracts.js";
import type { ContractsConfig } from "../doctor/types.js";

/** The flags as given; undefined when left out. */
export interface IntrospectFlags {
  out?: string;
  schema?: string;
  databaseEnv?: string;
}

export interface IntrospectSettings {
  /** Absolute path of the contract file. */
  target: string;
  /** How to name it in messages: as given, or app-relative. */
  label: string;
  schemas: string[];
  databaseEnv: string;
}

/**
 * @param cwd where the command runs (a flag's path is relative to it)
 * @param contracts the app's `doctor.contracts`, when its config sets one
 * @param configDir the folder holding that config (its paths are relative to it)
 */
export function introspectSettings(flags: IntrospectFlags, cwd: string, contracts?: ContractsConfig, configDir = cwd): IntrospectSettings {
  const fromFlag = flags.out !== undefined;
  const out = flags.out ?? contracts?.out ?? DEFAULT_CONTRACT_OUT;
  const schemas = flags.schema !== undefined
    ? flags.schema.split(",").map((s) => s.trim()).filter(Boolean)
    : contracts?.schemas?.length ? [...contracts.schemas] : ["public"];
  return {
    target: path.resolve(fromFlag ? cwd : configDir, out),
    label: out,
    schemas,
    databaseEnv: flags.databaseEnv ?? contracts?.databaseEnv ?? "DATABASE_URL",
  };
}
