/**
 * Stale allow entries: an entry that covered nothing in the pages, viewports and engines a run
 * actually visited. Every run checks it, the per-PR scope included (for what that PR visited). It is
 * a warning, not a failure: an allowed finding that is flaky shouldn't turn main red on a quiet
 * night, so a person removes the entry once it is reported stale. A sharded run keeps its findings
 * logs for the report job, which checks every shard's together (`tsx conformance/teardown.ts <dir>`).
 */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchesPage } from "@marktiderman/genesis-cli/verify";
import { ALLOW, RESULTS_DIR } from "./check";

interface LogLine {
  page: string;
  viewport: string;
  engine: string;
  allowed: number[];
}

/** Every findings log under a folder (one per worker, per shard). */
export function findingsLogs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /^conformance-findings-.*\.jsonl$/.test(d.name))
    .map((d) => join(d.parentPath, d.name));
}

export function staleEntries(logs: string[]): string[] {
  const used = new Set<number>();
  const visited: LogLine[] = [];
  for (const log of logs) {
    for (const line of readFileSync(log, "utf8").split("\n")) {
      if (!line) continue;
      const entry = JSON.parse(line) as LogLine;
      visited.push(entry);
      for (const i of entry.allowed) used.add(i);
    }
  }
  return ALLOW.flatMap((e, i) => {
    if (used.has(i)) return [];
    // Only stale when the run visited what the entry is about.
    const ran = visited.some(
      (v) => matchesPage(e.page, v.page) && (!e.viewports || e.viewports.includes(v.viewport)) && (!e.engines || e.engines.includes(v.engine as never)),
    );
    return ran ? [`${e.check}${e.rule ? `/${e.rule}` : ""} on ${e.page}${e.target ? ` (${e.target})` : ""}`] : [];
  });
}

function warn(stale: string[]) {
  if (!stale.length) return console.log("No stale allow entries.");
  const text = `Stale allow entries in apps/sample/conformance/allow.json; remove them:\n${stale.join("\n")}`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning title=Stale conformance allow entries::${text.replace(/\n/g, "%0A")}` : text);
}

export default function teardown() {
  if (process.env.CONFORMANCE_SHARD) return; // the report job checks every shard together
  const logs = findingsLogs(RESULTS_DIR);
  if (!logs.length) return;
  warn(staleEntries(logs));
  for (const log of logs) rmSync(log);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  warn(staleEntries(process.argv.slice(2).flatMap(findingsLogs)));
}
