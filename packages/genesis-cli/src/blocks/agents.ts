/**
 * AGENTS.md fragments: Markdown a package ships for one block, kept in the
 * app's AGENTS.md between markers so `genesis upgrade` can replace it with the
 * installed version's text. Everything outside the markers is the app's.
 */

export function fragmentMarkers(blockId: string): { start: string; end: string } {
  return { start: `<!-- genesis-block:${blockId}:start -->`, end: `<!-- genesis-block:${blockId}:end -->` };
}

/**
 * The AGENTS.md text with the block's fragment in place: replaced between its
 * markers, or appended. Throws when the markers are broken (one without the other).
 */
export function mergeFragment(agents: string | null, blockId: string, fragment: string, source: string): string {
  const { start, end } = fragmentMarkers(blockId);
  if (fragment.includes("<!-- genesis-block:")) throw new Error(`${source} contains a genesis-block marker; a fragment can't hold one.`);
  const body = `${start}\n<!-- From ${source}; \`genesis upgrade\` replaces this block. Don't edit it. -->\n${fragment.trim()}\n${end}`;
  const text = agents ?? "# Agent notes\n";
  const s = text.indexOf(start);
  const e = text.indexOf(end);
  if (s < 0 && e < 0) return `${text.replace(/\s*$/, "")}\n\n${body}\n`;
  if (s < 0 || e < 0 || e < s || text.indexOf(start, s + 1) >= 0) throw new Error(`AGENTS.md has a broken ${start} … ${end} block; fix it by hand.`);
  return `${text.slice(0, s)}${body}${text.slice(e + end.length)}`;
}

/** A skill's folder name in `.claude/skills`: its frontmatter `name`, else the package's folder for it. */
export function skillName(content: string, packagePath: string): string {
  const fm = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  const name = fm ? /^name:\s*["']?([A-Za-z0-9][A-Za-z0-9_-]*)["']?\s*$/m.exec(fm)?.[1] : undefined;
  const fallback = packagePath.split("/").slice(-2, -1)[0];
  const picked = (name ?? fallback ?? "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(picked)) throw new Error(`Can't name the skill at ${packagePath}: give its frontmatter a name.`);
  return picked;
}
