/**
 * After a full run, an allow entry that covered nothing is stale and fails the run, so the list
 * only shrinks. A sharded run keeps its findings log for the report job, which checks all shards'
 * logs together (`tsx conformance/teardown.ts <logs…>`). Per-PR runs visit a subset and skip it.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ALLOW, FINDINGS_LOG } from "./check";
import { SCOPE } from "./pages";

export function staleEntries(logs: string[]): string[] {
  const used = new Set<number>();
  for (const log of logs) {
    for (const line of readFileSync(log, "utf8").split("\n")) {
      if (line) for (const i of (JSON.parse(line) as { allowed: number[] }).allowed) used.add(i);
    }
  }
  return ALLOW.flatMap((e, i) => (used.has(i) ? [] : [`${e.check}${e.rule ? `/${e.rule}` : ""} on ${e.page}`]));
}

function fail(stale: string[]) {
  if (stale.length) throw new Error(`Stale allow entries in conformance/allow.json (remove them):\n${stale.join("\n")}`);
}

export default function teardown() {
  if (process.env.CONFORMANCE_SHARD || !existsSync(FINDINGS_LOG)) return;
  const stale = SCOPE === "full" ? staleEntries([FINDINGS_LOG]) : [];
  rmSync(FINDINGS_LOG);
  fail(stale);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  fail(staleEntries(process.argv.slice(2).filter((f) => existsSync(f))));
  console.log("No stale allow entries.");
}
