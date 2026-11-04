/**
 * What's known about a major move with no codemod: a link to the package's changelog, and, when
 * it can be read, the major changes it lists. The published packages don't ship their changelogs,
 * so the text comes from the Genesis repository. A major listing none of its own moved with its
 * dependencies (changesets' fixed and dependent bumps), and a peer's break can still reach the
 * app, so the line says only that.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { packageDir } from "../blocks/discover.js";
import { compareVersions, type BumpChange } from "./bump-core.mjs";

const REPOSITORY = "marktiderman/genesis";

export interface ChangelogReader {
  /** The changelog of the package in this repository folder, or null when it can't be read. */
  changelog?(directory: string): Promise<string | null> | string | null;
}

/** The Genesis repository's changelog, or null when it can't be fetched in a few seconds. */
export async function fetchChangelog(directory: string): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/main/${directory}/CHANGELOG.md`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const bare = (spec: string) => spec.replace(/^[\^~=]/, "");
const firstLine = (entry: string) => {
  const line = entry.replace(/^-\s*(?:[0-9a-f]{7,}:\s*)?/, "").split("\n")[0]!.trim();
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
};

/** The breaking entries a changelog lists between two versions; null when it doesn't reach the version moved to. */
export function breakingEntries(changelog: string, from: string, to: string): string[] | null {
  const low = bare(from);
  const high = bare(to);
  const heading = low.startsWith("0.") ? /^### (?:Major|Minor) Changes\s*$/ : /^### Major Changes\s*$/;
  const parts = changelog.split(/^## (?=\d)/m).slice(1);
  let matched = false;
  const entries: string[] = [];
  for (const part of parts) {
    const version = part.split("\n", 1)[0]!.trim();
    if (compareVersions(version, low) <= 0 || compareVersions(version, high) > 0) continue;
    if (compareVersions(version, high) === 0) matched = true;
    let inside = false;
    for (const line of part.split("\n")) {
      if (line.startsWith("### ")) inside = heading.test(line);
      else if (inside && line.startsWith("- ")) entries.push(firstLine(line));
    }
  }
  return matched ? entries : null;
}

function repositoryDirectory(root: string, name: string): string | null {
  const dir = packageDir(root, name);
  if (!dir) return null;
  try {
    const { repository } = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { repository?: { directory?: unknown } };
    return typeof repository?.directory === "string" ? repository.directory : null;
  } catch {
    return null;
  }
}

/** One summary line for each package's major move, once per package, from the lowest version any package.json moved from. */
export async function breakLines(root: string, breaks: readonly BumpChange[], reader: ChangelogReader): Promise<string[]> {
  const lowest = new Map<string, BumpChange>();
  for (const b of breaks) {
    const key = `${b.name}@${b.to}`;
    const held = lowest.get(key);
    if (!held || compareVersions(bare(b.from), bare(held.from)) < 0) lowest.set(key, b);
  }
  const lines: string[] = [];
  for (const b of lowest.values()) {
    const directory = repositoryDirectory(root, b.name);
    const url = directory ? `https://github.com/${REPOSITORY}/blob/main/${directory}/CHANGELOG.md#${bare(b.to).replace(/\D/g, "")}` : `https://www.npmjs.com/package/${b.name}`;
    const head = `- \`${b.name}\` ${b.from} → ${b.to}`;
    const text = directory && reader.changelog ? await reader.changelog(directory) : null;
    const entries = text === null ? null : breakingEntries(text, b.from, b.to);
    if (entries === null) lines.push(`${head}: read [its changelog](${url})`);
    else if (!entries.length) lines.push(`${head}: no breaking changes of its own; moved with its dependencies, see [its changelog](${url})`);
    else lines.push(`${head}: [changelog](${url})`, ...entries.slice(0, 5).map((e) => `  - ${e}`), ...(entries.length > 5 ? [`  - and ${entries.length - 5} more`] : []));
  }
  return lines;
}
