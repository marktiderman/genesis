/**
 * `genesis-behind`: the app's Genesis release against the latest, and the advisories published for
 * what it has installed (src/upgrade/registry.ts reads both, cached for 24 hours).
 *
 * | Distance | Level |
 * |---|---|
 * | a patch behind | info |
 * | 1–2 minors behind | warn, shown as info under `--strict` so it never fails a strict run |
 * | more than 2 minors, a major, or behind for 90 days or more | warn (fails `--strict`) |
 * | an advisory of high or critical severity affects an installed version | error, with the advisory's id |
 * | a lower-severity advisory | warn |
 *
 * In CI (`CI` set) a distance is at most a warning that never fails a run, `--strict` included:
 * a release published overnight must not turn every app's pipeline red. Advisories keep their
 * levels there.
 *
 * With the network off (the Vite plugin, tests, `--offline`) or unreachable, the rule reads only
 * the cache and says what it last knew in one info finding; it never errors then. No cache and no
 * network: nothing to say. An app without the `@marktiderman/genesis` umbrella isn't checked.
 * The fix is `upgrade.release`: `genesis upgrade` in a pull request, never merged.
 */
import { distance, readUpgradeStatus, type RegistryDeps, type UpgradeStatus } from "../upgrade/registry.js";
import { UMBRELLA_PACKAGE } from "./versions.js";
import type { DoctorContext } from "./types.js";

export const BEHIND_RULE = "genesis-behind";
/** Behind for this long counts as far behind, however small the distance. */
export const BEHIND_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;
const FILE = "package.json";

export function genesisBehindCheck(deps: RegistryDeps = {}): (ctx: DoctorContext) => Promise<void> {
  return async (ctx) => {
    const status = await readUpgradeStatus(ctx.root, deps);
    if (!status) return;
    const now = (deps.now ?? (() => new Date()))();
    if (status.source === "cache" && (status.offlineReason || status.stale)) return reportOffline(ctx, status);
    reportStatus(ctx, status, now, deps.ci ?? Boolean(process.env.CI));
  };
}

function behindLine(status: UpgradeStatus): string {
  return `${UMBRELLA_PACKAGE} ${status.installed} is installed; the latest is ${status.latest}`;
}

const SERIOUS = new Set(["high", "critical"]);

function reportStatus(ctx: DoctorContext, status: UpgradeStatus, now: Date, ci: boolean): void {
  for (const a of status.advisories) {
    ctx.report({
      rule: BEHIND_RULE,
      level: SERIOUS.has(a.severity.toLowerCase()) ? "error" : "warn",
      file: FILE,
      subject: a.id,
      message: `${a.package}@${a.version} is affected by ${a.id} (${a.severity}): ${a.title}${a.vulnerable ? ` (affected: ${a.vulnerable})` : ""}${a.url ? `; ${a.url}` : ""}. Upgrade Genesis: genesis fix upgrade.release`,
    });
  }
  if (!status.latest) return;
  const d = distance(status.installed, status.latest);
  if (d.kind === "current") return;
  const days = status.firstNewerAt ? Math.floor((now.getTime() - Date.parse(status.firstNewerAt)) / DAY) : null;
  const old = days !== null && days >= BEHIND_DAYS;
  const since = days !== null ? `, behind for ${days} day${days === 1 ? "" : "s"}` : "";
  const fix = "; genesis fix upgrade.release opens the upgrade pull request";
  const far = d.kind === "major" || (d.kind === "minor" && d.minors > 2) || old;
  // A warning that never fails: shown as info when warnings fail (--strict).
  const soft = ctx.strict ? "info" : "warn";
  if (far) {
    const what = d.kind === "major" ? `${d.majors} major release${d.majors === 1 ? "" : "s"} behind` : d.kind === "minor" ? `${d.minors} minor releases behind` : "behind";
    ctx.report({ rule: BEHIND_RULE, level: ci ? soft : "warn", file: FILE, subject: UMBRELLA_PACKAGE, message: `${behindLine(status)} (${what}${since})${fix}` });
    return;
  }
  if (d.kind === "minor") {
    // A minor or two behind is worth a nudge, never a failed strict run.
    ctx.report({
      rule: BEHIND_RULE,
      level: soft,
      file: FILE,
      subject: UMBRELLA_PACKAGE,
      message: `${behindLine(status)} (${d.minors} minor release${d.minors === 1 ? "" : "s"} behind${since})${fix}`,
    });
    return;
  }
  ctx.report({ rule: BEHIND_RULE, level: "info", file: FILE, subject: UMBRELLA_PACKAGE, message: `${behindLine(status)} (a patch behind${since})${fix}` });
}

/** Offline: one info finding from what the cache last knew, when it knew of something to do. */
function reportOffline(ctx: DoctorContext, status: UpgradeStatus): void {
  const behind = status.latest !== null && distance(status.installed, status.latest).kind !== "current";
  if (!behind && !status.advisories.length) return;
  const parts = [
    ...(behind ? [`the latest was ${status.latest} (installed: ${status.installed})`] : []),
    ...(status.advisories.length ? [`${status.advisories.length} advisor${status.advisories.length === 1 ? "y" : "ies"} affected the installed versions (${status.advisories.map((a) => a.id).join(", ")})`] : []),
  ];
  ctx.report({
    rule: BEHIND_RULE,
    level: "info",
    file: FILE,
    subject: UMBRELLA_PACKAGE,
    message: `not checked now (${status.offlineReason ?? "the cache is out of date"}); as of ${status.checkedAt.slice(0, 10)}, ${parts.join(", and ")}. Run genesis doctor without --offline to check again`,
  });
}
