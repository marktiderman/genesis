/**
 * pnpm's `minimumReleaseAgeExclude` after an upgrade.
 *
 * An upgrade moves an app to Genesis releases younger than its `minimumReleaseAge`. pnpm in loose
 * mode (`minimumReleaseAgeStrict: false`) installs them anyway and pins each one in
 * pnpm-workspace.yaml (`'@marktiderman/genesis-ui@2.26.0'`). pnpm reads the list first match per
 * package name, at least up to 11.1.3: once a package has two pinned entries (two upgrades, or two
 * versions installed at once), only the first version counts, and `pnpm install --frozen-lockfile`
 * fails with ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION on the other.
 *
 * So the upgrade replaces every Genesis entry with one name pattern for Genesis's own packages
 * (`'@marktiderman/genesis-*'`, and the umbrella by its bare name), which pnpm 11 honours for both
 * a resolving and a frozen install. Only Genesis's own names are touched: every other entry is the
 * app's supply-chain guard and stays as it is. The file's other lines, comments and order are kept.
 */
import { GENESIS, UMBRELLA } from "./bump-core.mjs";

/** The entry that stands for every Genesis package but the umbrella. */
export const GENESIS_PATTERN = "@marktiderman/genesis-*";

/** The package name of an exclude entry (`name`, `name@1.2.3`, `name@1.2.3 || 1.3.0`). */
function entryName(entry: string): string {
  const at = entry.startsWith("@") ? entry.indexOf("@", 1) : entry.indexOf("@");
  return at === -1 ? entry : entry.slice(0, at);
}

/** What a Genesis entry becomes, or null for an entry that isn't Genesis's. */
function genesisReplacement(entry: string): string | null {
  if (entry === GENESIS_PATTERN) return GENESIS_PATTERN;
  const name = entryName(entry);
  if (!GENESIS.test(name)) return null;
  return name === UMBRELLA ? UMBRELLA : GENESIS_PATTERN;
}

/** A YAML scalar's value: quoted ('' escapes a quote) or plain. */
function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

const KEY = /^minimumReleaseAgeExclude:(.*)$/;
const ITEM = /^(\s*-\s+)('(?:[^']|'')*'|"[^"]*"|[^#\s][^#]*?)(\s+#.*)?\s*$/;
const BLANK_OR_COMMENT = /^\s*(#.*)?$/;

/**
 * pnpm-workspace.yaml's text with each Genesis entry of `minimumReleaseAgeExclude` replaced by
 * its pattern, written once. Unchanged when there is nothing to replace, so it is idempotent.
 */
export function normaliseReleaseAgeExcludes(text: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => KEY.test(l));
  if (start === -1) return text;
  const seen = new Set<string>();
  const out = lines.slice(0, start);

  // The flow form on one line: minimumReleaseAgeExclude: ['a', 'b'] # comment
  const rest = KEY.exec(lines[start]!)![1]!;
  const flow = /^(\s*)\[(.*)\](\s*(?:#.*)?)$/.exec(rest);
  if (flow) {
    const items = flow[2]!.split(",").map((s) => s.trim()).filter(Boolean);
    const kept: string[] = [];
    for (const raw of items) {
      const value = unquote(raw);
      const replacement = genesisReplacement(value);
      if (replacement === null) kept.push(raw);
      else if (!seen.has(replacement)) {
        seen.add(replacement);
        kept.push(`'${replacement}'`);
      }
    }
    const line = `minimumReleaseAgeExclude:${flow[1]}[${kept.join(", ")}]${flow[3]}`;
    return [...out, line, ...lines.slice(start + 1)].join(eol);
  }

  // The block form: the key, then its `- entry` lines (blank lines and comments between them kept).
  out.push(lines[start]!);
  let i = start + 1;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const item = ITEM.exec(line);
    if (!item) {
      if (BLANK_OR_COMMENT.test(line)) {
        out.push(line);
        continue;
      }
      break;
    }
    const replacement = genesisReplacement(unquote(item[2]!));
    if (replacement === null) out.push(line);
    else if (!seen.has(replacement)) {
      seen.add(replacement);
      out.push(`${item[1]}'${replacement}'${item[3] ?? ""}`);
    }
  }
  const result = [...out, ...lines.slice(i)].join(eol);
  return result;
}
