// =====================================================================
// Gitdata naming + contracts — browser-safe (no node:fs).
// =====================================================================

import type { ResourceContract } from "./types";

/** Stable resource name for a gitdata table — minimum wiring for new tables. */
export function gitdataResourceName(table: string): string {
  return `gitdata_${table}`;
}

/** Default markdown contract: identity + common columns; extras still round-trip. */
export function gitdataMdContract(
  resourceName: string,
  opts?: { description?: string; key?: string },
): ResourceContract {
  return {
    name: resourceName,
    key: opts?.key ?? "id",
    sourceOfTruth: "L2",
    description:
      opts?.description ??
      `Gitdata markdown table (${resourceName}) — frontmatter + body.`,
    fields: [
      { name: "id", type: "string" },
      { name: "slug", type: "string", optional: true },
      { name: "title", type: "string", optional: true },
      { name: "type", type: "string", optional: true },
      { name: "parent", type: "string", optional: true },
      { name: "status", type: "string", optional: true },
      { name: "cleanse", type: "string", optional: true },
      { name: "coord", type: "string", optional: true },
      { name: "version", type: "string", optional: true },
      { name: "job", type: "string", optional: true },
      { name: "body", type: "string", optional: true },
      {
        name: "_path",
        type: "string",
        optional: true,
        description: "Relative path under data/",
      },
    ],
  };
}
