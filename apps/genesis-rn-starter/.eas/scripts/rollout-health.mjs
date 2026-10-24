#!/usr/bin/env node
/**
 * The health check rollout.yml runs before promoting a staged update.
 *
 *   eas update:insights <group> --json > insights.json
 *   MAX_FAILED_LAUNCH_PERCENT=1 MIN_LAUNCHES=200 node .eas/scripts/rollout-health.mjs insights.json
 *
 * It exits 1, saying why, when the insights have no platform, when a platform counted fewer than
 * MIN_LAUNCHES launches (too early to tell), or when more than MAX_FAILED_LAUNCH_PERCENT of a
 * platform's launches failed. A threshold that isn't a number is an error, never a pass.
 *
 * "Failed launches" are what EAS counts: expo-updates couldn't start the update and fell back.
 * Crash-free sessions are not in EAS's insights; read them in your crash reporter.
 *
 * Genesis template (templates/eas/scripts/rollout-health.mjs).
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @param {unknown} insights `eas update:insights --json` output.
 * @param {{ maxFailedLaunchPercent: number; minLaunches: number }} limits
 * @returns {{ ok: boolean; lines: string[] }}
 */
export function checkRollout(insights, { maxFailedLaunchPercent, minLaunches }) {
  if (!Number.isFinite(maxFailedLaunchPercent) || maxFailedLaunchPercent < 0 || maxFailedLaunchPercent > 100) {
    return { ok: false, lines: [`MAX_FAILED_LAUNCH_PERCENT must be a number from 0 to 100, got ${maxFailedLaunchPercent}.`] };
  }
  if (!Number.isInteger(minLaunches) || minLaunches < 0) {
    return { ok: false, lines: [`MIN_LAUNCHES must be a whole number, got ${minLaunches}.`] };
  }
  const platforms = Array.isArray(insights?.platforms) ? insights.platforms : [];
  if (platforms.length === 0) {
    return { ok: false, lines: ["The insights list no platform: is the update group id right?"] };
  }
  let ok = true;
  const lines = [];
  for (const entry of platforms) {
    const name = typeof entry?.platform === "string" ? entry.platform : "unknown platform";
    const installs = Number(entry?.totals?.installs);
    const failed = Number(entry?.totals?.failedInstalls);
    if (!Number.isFinite(installs) || !Number.isFinite(failed)) {
      ok = false;
      lines.push(`${name}: the insights have no launch counts.`);
      continue;
    }
    const launches = installs + failed;
    const percent = launches === 0 ? 0 : (failed / launches) * 100;
    const summary = `${name}: ${failed} of ${launches} launches failed (${percent.toFixed(2)}%)`;
    if (launches < minLaunches) {
      ok = false;
      lines.push(`${summary}; fewer than ${minLaunches} launches, too early to promote.`);
    } else if (percent > maxFailedLaunchPercent) {
      ok = false;
      lines.push(`${summary}; more than ${maxFailedLaunchPercent}%, don't promote (roll back instead?).`);
    } else {
      lines.push(`${summary}; within ${maxFailedLaunchPercent}%.`);
    }
  }
  return { ok, lines };
}

/** Unset gives the default; an empty or non-numeric value gives NaN, which `checkRollout` refuses. */
function numberFrom(value, fallback) {
  if (value === undefined) return fallback;
  return value.trim() === "" ? Number.NaN : Number(value);
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node rollout-health.mjs <insights.json>");
    process.exit(1);
  }
  const { ok, lines } = checkRollout(JSON.parse(readFileSync(file, "utf8")), {
    maxFailedLaunchPercent: numberFrom(process.env.MAX_FAILED_LAUNCH_PERCENT, 1),
    minLaunches: numberFrom(process.env.MIN_LAUNCHES, 200),
  });
  for (const line of lines) (ok ? console.log : console.error)(line);
  if (!ok) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
