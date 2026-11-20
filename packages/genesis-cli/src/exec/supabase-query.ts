/**
 * Run SQL against the linked Supabase project: `supabase db query --linked -f <file>`.
 *
 * The SQL goes through a temp file (mode 0600, in a fresh folder that is removed afterwards), not
 * `-f /dev/stdin`: the CLI doesn't read every platform's stdin device reliably, and Windows has
 * none. Only fixed statements go this way (the names in Vault, the settings table, the manifest),
 * never a secret's value.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runTool, TOOL_AUTH_ENV, type RunToolResult, type ToolRunner } from "./run.js";

export interface SupabaseQueryOptions {
  /** Default 30 seconds. */
  timeoutMs?: number;
  /** Arguments after `--linked` (`-o json`, `--project-ref <ref>`, `--yes`). */
  args?: readonly string[];
}

export async function supabaseQuery(root: string, sql: string, run: ToolRunner = runTool, options: SupabaseQueryOptions = {}): Promise<RunToolResult> {
  const dir = mkdtempSync(path.join(tmpdir(), "genesis-sql-"));
  try {
    const file = path.join(dir, "query.sql");
    writeFileSync(file, sql, { mode: 0o600 });
    return await run("supabase", ["db", "query", "--linked", ...(options.args ?? []), "-f", file], { cwd: root, timeoutMs: options.timeoutMs ?? 30_000, passEnv: TOOL_AUTH_ENV["supabase"] ?? [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
