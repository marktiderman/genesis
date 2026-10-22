import { FEATURE_STATUSES, toRecords, type Features, type Flags } from "./model";

/** Marks the start of the generated block in AGENTS.md. */
export const AGENTS_BLOCK_START = "<!-- genesis-features:start -->";
/** Marks the end of the generated block in AGENTS.md. */
export const AGENTS_BLOCK_END = "<!-- genesis-features:end -->";

export interface GenerateOptions {
  /** The file the registry lives in, named in the "generated from" note. Default `src/features.ts`. */
  source?: string;
}

/**
 * The registry as JSON, for tools that can't import TypeScript. Stable: no
 * timestamps, features in declaration order, so `check` can compare it.
 *
 * @stability Beta
 */
export function toJson(features: Features, flags?: Flags, options: GenerateOptions = {}): string {
  const doc = {
    generatedFrom: options.source ?? "src/features.ts",
    features: toRecords(features, flags),
    flags: flags ?? {},
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const code = (value: string) => `\`${value.replace(/`/g, "'")}\``;

/**
 * The marker-delimited block for AGENTS.md: every feature, grouped by status,
 * with its owner, apps, audience, flags and code paths. Write it with
 * {@link replaceAgentsBlock}; never edit it by hand.
 *
 * @stability Beta
 */
export function toAgentsMarkdown(features: Features, flags?: Flags, options: GenerateOptions = {}): string {
  const source = options.source ?? "src/features.ts";
  const records = toRecords(features, flags);
  const lines = [
    AGENTS_BLOCK_START,
    "## Features",
    "",
    `Generated from \`${source}\` by \`genesis features build\`. Don't edit this block: change \`${source}\` and run the build. \`genesis features check\` fails when it is stale.`,
    "",
  ];
  for (const status of FEATURE_STATUSES) {
    const group = records.filter((r) => r.status === status);
    if (group.length === 0) continue;
    lines.push(`### ${status[0]!.toUpperCase()}${status.slice(1)}`, "");
    lines.push("| id | name | summary | owner | apps | audience | flags | code |", "|---|---|---|---|---|---|---|---|");
    for (const r of group) {
      lines.push(
        `| ${[
          code(r.id),
          cell(r.name),
          cell(r.summary),
          cell(r.owner),
          cell(r.apps.join(", ")),
          cell(r.audience.join(", ")),
          r.flags.map(code).join(", "),
          (r.links?.code ?? []).map(code).join(", "),
        ].join(" | ")} |`,
      );
    }
    lines.push("");
  }
  lines.push(AGENTS_BLOCK_END);
  return lines.join("\n");
}

/** The generated block inside `doc`, markers included, or null when there is none. */
export function readAgentsBlock(doc: string): string | null {
  const start = doc.indexOf(AGENTS_BLOCK_START);
  const end = doc.indexOf(AGENTS_BLOCK_END, start);
  if (start === -1 || end === -1) return null;
  return doc.slice(start, end + AGENTS_BLOCK_END.length);
}

/**
 * `doc` with its generated block replaced by `block`, or with `block` appended
 * when it has none yet. Everything outside the markers is left as it was.
 *
 * @stability Beta
 */
export function replaceAgentsBlock(doc: string, block: string): string {
  const current = readAgentsBlock(doc);
  if (current !== null) return doc.replace(current, () => block);
  const base = doc.length === 0 || doc.endsWith("\n") ? doc : `${doc}\n`;
  return `${base}${base.length ? "\n" : ""}${block}\n`;
}
