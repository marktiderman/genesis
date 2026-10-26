// A day (YYYY-MM-DD) in plain words. Pure.

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** A day (YYYY-MM-DD) in words, given today on the same clock: "Today", "Yesterday", "Oct 21", "Oct 21, 2025". */
export function dayLabel(day: string, today?: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return day;
  if (today) {
    const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - t) / 86_400_000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (day.slice(0, 4) !== today.slice(0, 4)) return MONTH_DAY_YEAR.format(t);
  }
  return MONTH_DAY.format(t);
}
