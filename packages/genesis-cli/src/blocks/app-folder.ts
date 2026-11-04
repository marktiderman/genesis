/**
 * An app that isn't at its repository's root (genesis.config.json `"appFolder": "mobile"`).
 *
 * - EAS reads `.eas/workflows` from the app's folder, but the `paths` in them are from the
 *   repository root. Written with the setting's folder, they're the same text the app would
 *   otherwise keep as an edit on every line, which conflicts with each template change.
 * - GitHub reads workflows only from the repository's own `.github/workflows`, a file that also
 *   holds the rest of the repository's CI, so the templates for it are never refreshed there.
 */
import { readGenesisConfig } from "../doctor/config.js";
import { APP_FOLDER_PLACEHOLDER } from "./init-native.js";

const EAS_WORKFLOW = /^\.eas\/workflows\/[^/]+\.ya?ml$/;
const PATH_ITEM = /^(\s*-\s*)(["']?)([^"'#\s]+)\2(\s*(?:#.*)?)$/;
const INLINE_PATHS = /^(\s*(?:#\s*)?paths:\s*\[)(.*)(\]\s*)$/;

export function appFolderOf(root: string): string | null {
  return readGenesisConfig(root)?.appFolder ?? null;
}

/** A `.github/workflows` file: with `appFolder`, the repository's, not this app's. */
export const isRepositoryWorkflow = (rel: string) => rel.startsWith(".github/workflows/");

/**
 * The lock's substitutions for the text written: the code folder an older lock never recorded
 * defaults to `src`, as `genesis init` writes it. Without `appFolder`, the lock's as they are.
 */
export function folderSubstitutions(substitutions: Record<string, string> | undefined, folder: string | null): Record<string, string> | undefined {
  if (!folder || substitutions?.[APP_FOLDER_PLACEHOLDER]) return substitutions;
  return { [APP_FOLDER_PLACEHOLDER]: "src", ...substitutions };
}

function fromRepositoryRoot(entry: string, folder: string): string {
  const negated = entry.startsWith("!");
  const body = negated ? entry.slice(1) : entry;
  return `${negated ? "!" : ""}${body === folder || body.startsWith(`${folder}/`) ? body : `${folder}/${body}`}`;
}

/** An owned file's text as this app has it: an EAS workflow's `paths` start at the repository root. */
export function renderOwned(rel: string, text: string, folder: string | null): string {
  if (!folder || !EAS_WORKFLOW.test(rel)) return text;
  let inList = false;
  return text
    .split("\n")
    .map((line) => {
      const inline = INLINE_PATHS.exec(line);
      if (inline) return `${inline[1]}${inline[2]!.replace(/(["'])([^"']+)\1/g, (_all, quote: string, entry: string) => `${quote}${fromRepositoryRoot(entry, folder)}${quote}`)}${inline[3]}`;
      if (/^\s*paths:\s*$/.test(line)) {
        inList = true;
        return line;
      }
      if (!inList || /^\s*#/.test(line)) return line;
      const item = PATH_ITEM.exec(line);
      if (!item) {
        inList = false;
        return line;
      }
      return `${item[1]}${item[2]}${fromRepositoryRoot(item[3]!, folder)}${item[2]}${item[4]}`;
    })
    .join("\n");
}
