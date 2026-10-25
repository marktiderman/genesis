import type { CatalogFeature, Signal } from "./model";

/** A feature on the board with the evidence behind it. @stability Experimental */
export interface BoardItem {
  feature: CatalogFeature;
  /** Open signals linked to it. */
  signals: Signal[];
  demand: number;
}

/**
 * The roadmap without dates: what is being built now, next and later, the
 * ideas not yet agreed (ranked by demand), and the signals still to triage.
 *
 * @stability Experimental
 */
export interface Board {
  now: BoardItem[];
  next: BoardItem[];
  later: BoardItem[];
  ideas: BoardItem[];
  /** Open signals with no feature yet, newest first. */
  untriaged: Signal[];
  /** Open signals naming a feature id the catalog doesn't have. */
  unknown: Signal[];
}

/**
 * Demand for a feature: each open signal counts its importance (1 when unset)
 * plus its votes. Closed signals don't count, so demand falls as asks are
 * answered.
 *
 * @stability Experimental
 */
export function demand(signals: readonly Signal[]): number {
  return signals.filter((s) => s.state === "open").reduce((sum, s) => sum + (s.importance ?? 1) + s.votes, 0);
}

function byPriority(a: BoardItem, b: BoardItem): number {
  const building = Number(b.feature.status === "building") - Number(a.feature.status === "building");
  return building || b.demand - a.demand || a.feature.name.localeCompare(b.feature.name);
}

/**
 * Lays the catalog and its signals out as a board. A building feature with no
 * horizon counts as now. Signals are matched to features by id or alias.
 *
 * @stability Experimental
 */
export function buildBoard(features: readonly CatalogFeature[], signals: readonly Signal[]): Board {
  const owner = new Map<string, CatalogFeature>();
  for (const f of features) for (const name of [f.id, ...(f.aliases ?? [])]) owner.set(name, f);

  const linked = new Map<string, Signal[]>();
  const untriaged: Signal[] = [];
  const unknown: Signal[] = [];
  for (const s of signals) {
    if (s.state !== "open") continue;
    if (!s.featureId) untriaged.push(s);
    else {
      const f = owner.get(s.featureId);
      if (!f) unknown.push(s);
      else linked.set(f.id, [...(linked.get(f.id) ?? []), s]);
    }
  }

  const board: Board = { now: [], next: [], later: [], ideas: [], untriaged, unknown };
  for (const f of features) {
    const own = linked.get(f.id) ?? [];
    const item: BoardItem = { feature: f, signals: own, demand: demand(own) };
    if (f.status === "idea") board.ideas.push(item);
    else if (f.status === "planned" || f.status === "building") board[f.horizon ?? "now"].push(item);
  }
  for (const column of [board.now, board.next, board.later, board.ideas]) column.sort(byPriority);
  const newest = (a: Signal, b: Signal) => b.createdAt.localeCompare(a.createdAt);
  untriaged.sort(newest);
  unknown.sort(newest);
  return board;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const ref = (s: Signal) => (s.url ? `[${s.id.replace(/^github/, "")}](${s.url})` : s.id);

function table(items: readonly BoardItem[]): string {
  if (!items.length) return "_Nothing here._\n";
  const rows = items.map(
    (i) =>
      `| ${cell(i.feature.name)} (\`${i.feature.id}\`) | ${i.feature.status} | ${cell(i.feature.claimedBy ?? i.feature.owner)} | ${i.demand} | ${i.signals.map(ref).join(" ")} |`,
  );
  return ["| Feature | Status | Who | Demand | Asks |", "| --- | --- | --- | ---: | --- |", ...rows].join("\n") + "\n";
}

function list(signals: readonly Signal[]): string {
  if (!signals.length) return "_Nothing to triage._\n";
  return signals.map((s) => `- ${ref(s)} ${s.kind}: ${cell(s.title)}${s.featureId ? ` (names \`${s.featureId}\`)` : ""}`).join("\n") + "\n";
}

/** Options for {@link renderBoard}. @stability Experimental */
export interface RenderBoardOptions {
  /** Shown in the header, e.g. `2026-10-25`. */
  date: string;
  /** How many ideas to list. Default 15. */
  ideas?: number;
}

/**
 * The board as GitHub-flavoured markdown: one table per horizon, the top ideas
 * by demand, and the triage inbox.
 *
 * @stability Experimental
 */
export function renderBoard(board: Board, options: RenderBoardOptions): string {
  const ideas = board.ideas.slice(0, options.ideas ?? 15);
  return [
    "# Product board",
    "",
    `Generated ${options.date} by \`genesis-product board\` from \`features.ts\` and the idea and feedback issues. Don't edit it: change \`features.ts\`, or open an issue. A 👍 on an issue is a vote.`,
    "",
    "Demand counts each open ask linked to a feature (its importance, 1 to 3) plus its 👍.",
    "",
    `## Now (${board.now.length})`,
    "",
    table(board.now),
    `## Next (${board.next.length})`,
    "",
    table(board.next),
    `## Later (${board.later.length})`,
    "",
    table(board.later),
    `## Ideas (top ${ideas.length} of ${board.ideas.length} by demand)`,
    "",
    table(ideas),
    `## To triage (${board.untriaged.length})`,
    "",
    "Link each to a feature: add `feature:<id>` as a label, or put the id under **Feature** in the issue.",
    "",
    list(board.untriaged),
    ...(board.unknown.length ? [`## Unknown feature ids (${board.unknown.length})`, "", list(board.unknown)] : []),
  ].join("\n");
}
