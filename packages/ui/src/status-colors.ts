/**
 * Shared status color mappings
 *
 * Single source of truth for all status → color badge mappings.
 * Used across Command Center, Product Detail, Task Board, Roadmap, etc.
 */

/** PRD statuses */
export const prdStatusColors: Record<string, string> = {
  idea: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  drafting: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  locked: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  building: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  shipped: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

/** Task statuses */
export const taskStatusColors: Record<string, string> = {
  todo: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  in_review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

/** Product statuses */
export const productStatusColors: Record<string, string> = {
  production: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  design: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

/** Idea statuses */
export const ideaStatusColors: Record<string, string> = {
  new: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  reviewed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  promoted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  dismissed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

/** Feedback statuses */
export const feedbackStatusColors: Record<string, string> = {
  new: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  reviewed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  promoted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  archived: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

/** Changelog entry types */
export const changelogTypeColors: Record<string, string> = {
  feature: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  fix: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  improvement: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  breaking: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

/** Research recommended actions */
export const researchActionColors: Record<string, string> = {
  implement: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  investigate: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  monitor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  dismiss: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

/** Sync statuses */
export const syncStatusColors: Record<string, string> = {
  synced: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  pending_pr: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  behind: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  diverged: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

/** Coverage color helpers */
export function getCoverageColor(pct: number): string {
  if (pct >= 70) return "bg-emerald-500";
  if (pct >= 30) return "bg-amber-500";
  return "bg-red-500";
}

export function getCoverageTextColor(pct: number): string {
  if (pct >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 30) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

/** Combined lookup — useful when you don't know the entity type */
export const allStatusColors: Record<string, string> = {
  ...prdStatusColors,
  ...taskStatusColors,
  ...productStatusColors,
  ...ideaStatusColors,
  ...feedbackStatusColors,
};
