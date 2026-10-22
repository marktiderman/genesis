/**
 * Minimal globs for config: `*` matches within a folder, `**` across folders,
 * `?` one character, and a trailing `/` means "everything under this folder".
 */
export function globToRegExp(glob: string): RegExp {
  let g = glob.trim().replace(/^\.\//, "");
  if (g.endsWith("/")) g += "**";
  let out = "";
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*") {
      if (g[i + 1] === "*") {
        const slash = g[i + 2] === "/";
        out += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** A matcher for a list of globs; an empty list matches nothing. */
export function globMatcher(globs: readonly string[] | undefined): (path: string) => boolean {
  const res = (globs ?? []).filter((g) => g.trim()).map(globToRegExp);
  return (path) => res.some((re) => re.test(path));
}
