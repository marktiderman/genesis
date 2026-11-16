/**
 * Fails a pull request whose conformance allow list grows against its base: a new finding is fixed,
 * not allowed. An entry may be added only with the PR label `conformance: allow grows` and a
 * reason the reviewer accepts (the workflow passes ALLOW_GROWS=1 when the label is on).
 *
 *   tsx conformance/allow-grew.ts <base ref>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2];
if (!base) throw new Error("usage: tsx conformance/allow-grew.ts <base ref>");

const key = (e: Record<string, unknown>) => JSON.stringify([e.check, e.rule, e.page, e.viewports, e.engines, e.target]);
const here = JSON.parse(readFileSync(join(import.meta.dirname, "allow.json"), "utf8")).allow as Record<string, unknown>[];
let before: Record<string, unknown>[] = [];
try {
  before = JSON.parse(execFileSync("git", ["show", `${base}:apps/sample/conformance/allow.json`], { encoding: "utf8" })).allow;
} catch {
  console.log(`No allow list on ${base}: this pull request starts it.`);
  process.exit(0);
}
const old = new Set(before.map(key));
const added = here.filter((e) => !old.has(key(e)));
if (!added.length) {
  console.log(`The allow list didn't grow (${before.length} → ${here.length}).`);
} else if (process.env.ALLOW_GROWS === "1") {
  console.log(`The allow list grows by ${added.length}, with the "conformance: allow grows" label:\n${added.map((e) => `- ${e.check} on ${e.page}: ${e.reason}`).join("\n")}`);
} else {
  console.error(
    `The conformance allow list grows by ${added.length}. Fix the findings, or add the label "conformance: allow grows" with a reason the reviewer accepts:\n${added.map((e) => `- ${e.check}${e.rule ? `/${e.rule}` : ""} on ${e.page}`).join("\n")}`,
  );
  process.exit(1);
}
