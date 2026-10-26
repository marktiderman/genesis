/**
 * `iso-date-slice`: a day cut from an ISO timestamp. `toISOString().slice(0, 10)`
 * (or `.split("T")[0]`, `.substring(0, 10)`) is the day in UTC, which is
 * tomorrow for an evening in the Americas and yesterday for a morning in Asia.
 * The person's day is `personDay(person)` / `dayIn(zone)` from
 * `@marktiderman/genesis-core/dates`. A warning: an app that means UTC (a log
 * file name, a UTC report) allows it with a reason.
 */
import { lineAt } from "./scan.js";
import type { DoctorContext } from "./types.js";

const SCRIPT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);

/** `.toISOString()` followed by a cut to the date part. */
const ISO_DAY_CUT =
  /\.toISOString\(\)\s*\.\s*(?:slice\(\s*0\s*,\s*10\s*\)|substring\(\s*0\s*,\s*10\s*\)|substr\(\s*0\s*,\s*10\s*\)|split\(\s*(["'`])T\1\s*\)\s*\[\s*0\s*\]|split\(\s*(["'`])T\2\s*\)\s*\.\s*at\(\s*0\s*\))/g;

export function checkIsoDateSlices(ctx: DoctorContext): void {
  for (const file of ctx.files) {
    if (!SCRIPT_EXTS.has(file.ext) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file.path)) continue;
    for (const m of file.code.matchAll(ISO_DAY_CUT)) {
      ctx.report({
        rule: "iso-date-slice",
        level: "warn",
        file: file.path,
        line: lineAt(file.code, m.index ?? 0),
        subject: "toISOString",
        message:
          "cuts a day from an ISO timestamp, which is the day in UTC, not the person's; use personDay(person) or dayIn(zone) from @marktiderman/genesis-core/dates (allow it with a reason where UTC is meant)",
      });
    }
  }
}
