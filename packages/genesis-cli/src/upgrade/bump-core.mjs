// The lockstep bump, shared by `genesis upgrade` and the reusable genesis-upgrade workflow.
// Plain JavaScript with no imports, because the workflow embeds this file verbatim between its
// genesis-bump-core markers (`node scripts/sync-genesis-bump.mjs` rewrites them; a test fails when
// they drift). Edit it here, never in the workflow.
export const UMBRELLA = "@marktiderman/genesis";
export const GENESIS = /^@marktiderman\/genesis(-[a-z0-9-]+)?$/;
export const EXACT = /^(\^|~|=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
export const PLAIN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
export const SECTIONS =["dependencies", "devDependencies", "optionalDependencies"];

// semver precedence: x.y.z, then a release above its prereleases, then prerelease fields.
export function compareVersions(a, b) {
  const [ca, pa = ""] = a.split(/-(.*)/s);
  const [cb, pb = ""] = b.split(/-(.*)/s);
  const x = ca.split(".").map(Number), y = cb.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  if (!pa || !pb) return (pa ? 0 : 1) - (pb ? 0 : 1);
  const fa = pa.split("."), fb = pb.split(".");
  for (let i = 0; i < Math.max(fa.length, fb.length); i++) {
    if (fa[i] === undefined) return -1;
    if (fb[i] === undefined) return 1;
    const na = /^\d+$/.test(fa[i]), nb = /^\d+$/.test(fb[i]);
    if (na && nb && Number(fa[i]) !== Number(fb[i])) return Number(fa[i]) - Number(fb[i]);
    if (na !== nb) return na ? -1 : 1;
    if (fa[i] !== fb[i]) return fa[i] < fb[i] ? -1 : 1;
  }
  return 0;
}

// One package.json's bump. `wanted(name)` is the version a Genesis package moves to, or null when
// there is none. The range prefix (^, ~ or exact) is kept; workspace:, file:, link:, npm: aliases and
// other ranges are left alone, and nothing is downgraded. `text` is null when nothing changed.
export function bumpPackageJson(file, text, wanted) {
  const pkg = JSON.parse(text);
  const changes = [], skipped = [];
  for (const section of SECTIONS) {
    for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
      if (!GENESIS.test(name)) continue;
      const m = EXACT.exec(spec);
      if (!m) { skipped.push({ file, name, spec, why: "not a plain version" }); continue; }
      const want = wanted(name);
      if (!want) { skipped.push({ file, name, spec, why: "no latest version on npm" }); continue; }
      // A release names exact versions; anything else (a range, a tag) is never written.
      if (!PLAIN.test(want)) { skipped.push({ file, name, spec, why: `the release names ${JSON.stringify(want)}, not a version` }); continue; }
      const cmp = compareVersions(want, m[2]);
      if (cmp === 0) continue;
      if (cmp < 0) { skipped.push({ file, name, spec, why: `newer than ${want}` }); continue; }
      pkg[section][name] = `${m[1] ?? ""}${want}`;
      changes.push({ file, name, from: spec, to: pkg[section][name] });
    }
  }
  if (!changes.length) return { text: null, changes, skipped };
  const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
  return { text: JSON.stringify(pkg, null, indent) + (text.endsWith("\n") ? "\n" : ""), changes, skipped };
}

// The pull request body's table, the same for the CLI and the workflow.
export function bumpSummary(version, changes, skipped) {
  const row = (c) => `| \`${c.name}\` | ${c.from} | ${c.to} | ${c.file} |`;
  return [
    `Moves every Genesis package to the **${UMBRELLA}@${version}** release: the versions in its \`versions.json\`, and npm \`latest\` for packages it doesn't list.`,
    "",
    changes.length ? ["| Package | From | To | File |", "| --- | --- | --- | --- |", ...changes.map(row)].join("\n") : "Nothing to change.",
    ...(skipped.length ? ["", "Left alone:", "", ...skipped.map((s) => `- \`${s.name}\` ${s.spec} in ${s.file}: ${s.why}`)] : []),
  ].join("\n");
}

// pnpm's minimumReleaseAgeExclude after the install. A Genesis release younger than the app's
// minimumReleaseAge is installed in loose mode and pnpm pins it in pnpm-workspace.yaml
// ('@marktiderman/genesis-ui@2.26.0'), one entry per version. pnpm 11.1.3 reads that list first
// match per package name, so a second entry for one package fails `pnpm install --frozen-lockfile`
// with ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION. The tidy keeps exact versions, never a pattern: a
// pattern would exempt every future Genesis publish from the wait, so a compromised one would
// reach apps at once. Each Genesis package gets one entry listing the versions pinned
// ('@marktiderman/genesis-features@0.8.0 || 0.8.1', which pnpm 10.19 and later honour for a
// resolving and a frozen install), in the place of its first entry; with the lockfile's versions,
// a version it no longer resolves is dropped (and an entry left with none), so the list doesn't
// grow forever. A range the app wrote for a Genesis package ('…@~2.25.0') takes the pins into its
// entry with `||` (pnpm 11 rejects ranges: releaseAgeExcludeProblems says so). The two patterns
// genesis-cli 1.17.3 wrote, '@marktiderman/genesis-*' and the bare '@marktiderman/genesis', become
// the lockfile's exact versions; every other entry is the app's own and kept as it is, another
// pattern included. Other lines, comments and order are kept (a merged entry keeps the comment of
// its first entry whose version survives), and the text is unchanged when there is nothing to do.

// What genesis-cli 1.17.3's tidy wrote: they exempt every Genesis release, so they're replaced.
export const LEGACY_EXCLUDES = ["@marktiderman/genesis-*", UMBRELLA];

// The Genesis versions a pnpm lockfile resolves, as a Map of package name to a Set of versions.
export function lockedGenesisVersions(lockText) {
  const locked = new Map();
  const re = /(?<![\w/-])(@marktiderman\/genesis(?:-[a-z0-9-]+)?)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?![0-9A-Za-z.+-])/g;
  for (const m of lockText.matchAll(re)) {
    if (!locked.has(m[1])) locked.set(m[1], new Set());
    locked.get(m[1]).add(m[2]);
  }
  return locked;
}

// '@marktiderman/genesis-x@1.0.0 || ~1.1.0' -> { name, pins: exact versions, ranges: the rest }; null
// for anything that isn't a Genesis package with a version.
function genesisEntry(entry) {
  const at = entry.startsWith("@") ? entry.indexOf("@", 1) : entry.indexOf("@");
  if (at === -1) return null;
  const name = entry.slice(0, at);
  if (!GENESIS.test(name)) return null;
  const parts = entry.slice(at + 1).split("||").map((v) => v.trim());
  if (parts.some((v) => !v)) return null;
  return { name, pins: parts.filter((v) => PLAIN.test(v)), ranges: parts.filter((v) => !PLAIN.test(v)) };
}

function unquoteScalar(raw) {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

// `items` is [{ raw, entry, comment }]. Returns a Map from an item's index to what replaces it:
// [{ text, comment }], text null keeping the item as written; an item not in the map is dropped
// (merged into an earlier entry, or no version left).
function mergePins(items, locked) {
  const slots = new Map();
  const out = new Map();
  const slot = (name, index) => {
    let s = slots.get(name);
    if (!s) {
      s = { name, pins: new Set(), ranges: [], sources: [], count: 0, first: null };
      slots.set(name, s);
      if (!out.has(index)) out.set(index, []);
      out.get(index).push(s);
    }
    return s;
  };
  items.forEach((item, index) => {
    const entry = unquoteScalar(item.entry);
    if (LEGACY_EXCLUDES.includes(entry) && locked) {
      const names = entry === UMBRELLA ? [UMBRELLA].filter((n) => locked.has(n)) : [...locked.keys()].filter((n) => n !== UMBRELLA).sort();
      for (const name of names) {
        const s = slot(name, index);
        s.count += 2; // never left as written
        for (const v of locked.get(name)) s.pins.add(v);
        s.sources.push({ pins: [...locked.get(name)], ranges: [], comment: item.comment });
      }
      if (!names.length && !out.has(index)) out.set(index, []);
      return;
    }
    const parsed = genesisEntry(entry);
    if (!parsed) { out.set(index, [{ raw: true }]); return; }
    const s = slot(parsed.name, index);
    s.count++;
    if (s.first === null) s.first = entry;
    for (const v of parsed.pins) s.pins.add(v);
    for (const r of parsed.ranges) if (!s.ranges.includes(r)) s.ranges.push(r);
    s.sources.push({ pins: parsed.pins, ranges: parsed.ranges, comment: item.comment });
  });
  const result = new Map();
  for (const [index, list] of out) {
    const texts = [];
    for (const s of list) {
      if (s.raw) { texts.push({ text: null }); continue; }
      const keep = [...s.pins].filter((v) => !locked || locked.get(s.name)?.has(v)).sort(compareVersions);
      const parts = [...s.ranges, ...keep];
      if (!parts.length) continue;
      const entry = `${s.name}@${parts.join(" || ")}`;
      // A lone entry that already says this is left exactly as written.
      if (s.count === 1 && entry === s.first) { texts.push({ text: null }); continue; }
      const source = s.sources.find((src) => src.ranges.length || src.pins.some((v) => keep.includes(v)));
      texts.push({ text: `'${entry}'`, comment: source?.comment ?? "" });
    }
    if (texts.length) result.set(index, texts);
  }
  return result;
}

// `locked` (from tidyLocked) is the lockfile's versions; without it nothing is dropped, and 1.17.3's
// patterns can't be replaced (releaseAgeExcludeProblems names them).
export function normaliseReleaseAgeExcludes(text, locked) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const key = /^minimumReleaseAgeExclude:(.*)$/;
  const start = lines.findIndex((l) => key.test(l));
  if (start === -1) return text;
  const out = lines.slice(0, start);
  // The flow form on one line: minimumReleaseAgeExclude: ['a', 'b'] # comment
  const flow = /^(\s*)\[(.*)\](\s*(?:#.*)?)$/.exec(key.exec(lines[start])[1]);
  if (flow) {
    const raws = flow[2].split(",").map((s) => s.trim()).filter(Boolean);
    const merged = mergePins(raws.map((raw) => ({ raw, entry: raw, comment: "" })), locked);
    const kept = raws.flatMap((raw, i) => (merged.get(i) ?? []).map((m) => m.text ?? raw));
    const line = `minimumReleaseAgeExclude:${flow[1]}[${kept.join(", ")}]${flow[3]}`;
    return line === lines[start] ? text : [...out, line, ...lines.slice(start + 1)].join(eol);
  }
  // The block form: the key, then its `- entry` lines (blank lines and comments between them kept).
  const item = /^(\s*-\s+)('(?:[^']|'')*'|"[^"]*"|[^#\s][^#]*?)(\s+#.*)?\s*$/;
  let i = start + 1;
  const body = [];
  const items = [];
  for (; i < lines.length; i++) {
    const m = item.exec(lines[i]);
    if (!m) {
      if (/^\s*(#.*)?$/.test(lines[i])) { body.push({ line: lines[i] }); continue; }
      break;
    }
    body.push({ item: items.length, prefix: m[1] });
    items.push({ raw: lines[i], entry: m[2], comment: m[3] ?? "" });
  }
  const merged = mergePins(items, locked);
  const kept = body.flatMap((b) => {
    if (!("item" in b)) return [b.line];
    return (merged.get(b.item) ?? []).map((m) => (m.text === null ? items[b.item].raw : `${b.prefix}${m.text}${m.comment}`));
  });
  // Every entry dropped: an empty list, not a null one.
  const keyLine = items.length && merged.size === 0 ? "minimumReleaseAgeExclude: []" : lines[start];
  const next = [...out, keyLine, ...kept, ...lines.slice(i)].join(eol);
  return next === lines.join(eol) ? text : next;
}

// What is still wrong with the tidied list, for a warning: a range for a Genesis package (pnpm 11
// rejects any range with ERR_PNPM_INVALID_MINIMUM_RELEASE_AGE_EXCLUDE), and a 1.17.3 pattern left
// because no lockfile said which versions to put in its place.
export function releaseAgeExcludeProblems(text) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^minimumReleaseAgeExclude:/.test(l));
  if (start === -1) return problems;
  const flow = /^minimumReleaseAgeExclude:\s*\[(.*)\]/.exec(lines[start]);
  const entries = flow
    ? flow[1].split(",").map((s) => unquoteScalar(s)).filter(Boolean)
    : lines.slice(start + 1).map((l) => /^\s*-\s+('(?:[^']|'')*'|"[^"]*"|[^#\s][^#]*?)(\s+#.*)?\s*$/.exec(l)).filter(Boolean).map((m) => unquoteScalar(m[1]));
  for (const entry of entries) {
    if (LEGACY_EXCLUDES.includes(entry)) problems.push(`'${entry}' exempts every Genesis release from minimumReleaseAge (genesis-cli 1.17.3 wrote it); with no lockfile beside pnpm-workspace.yaml to read versions from, replace it by hand with exact versions ('@marktiderman/genesis-ui@2.26.0 || 2.27.0')`);
    const parsed = genesisEntry(entry);
    if (parsed?.ranges.length) problems.push(`'${entry}' has a range (${parsed.ranges.join(", ")}); pnpm 11 accepts only exact versions in minimumReleaseAgeExclude (ERR_PNPM_INVALID_MINIMUM_RELEASE_AGE_EXCLUDE): list the versions the app installs`);
  }
  return problems;
}

// pnpm reads exact versions and `||` in minimumReleaseAgeExclude from 10.19 on; earlier, an entry
// with a version matches nothing. False for an older pnpm, true otherwise (or when unknown).
export function pnpmReadsExactExcludes(version) {
  const m = /^(\d+)\.(\d+)\./.exec(String(version ?? "").trim());
  if (!m) return true;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > 10 || (major === 10 && minor >= 19);
}

// The pnpm-workspace.yaml pnpm reads and writes for an install in `start`: the nearest one at or
// above it, as pnpm finds it (not by the lockfile, which a workspace with
// sharedWorkspaceLockfile: false keeps in each project), else `fallback` (where pnpm would create
// one for a standalone app). The search stops at `stop` (the repository's top level), so a file
// outside the repository is never read or rewritten. `fs` is { exists, join, dirname }.
export function pnpmWorkspaceFile(start, fallback, fs, stop) {
  for (let dir = start; ; ) {
    const file = fs.join(dir, "pnpm-workspace.yaml");
    if (fs.exists(file)) return file;
    const parent = fs.dirname(dir);
    if (parent === dir || dir === stop) return fs.join(fallback, "pnpm-workspace.yaml");
    dir = parent;
  }
}

// The lockfile versions the tidy keeps pins for: the lockfile beside pnpm-workspace.yaml (`lockText`,
// null when there is none), unless each project keeps its own lockfile (sharedWorkspaceLockfile:
// false in pnpm-workspace.yaml, quoted or not, or shared-workspace-lockfile=false in the .npmrc
// beside it, `npmrcText`), when one lockfile doesn't hold them all and nothing is dropped (null).
export function tidyLocked(workspaceText, lockText, npmrcText) {
  if (lockText === null || lockText === undefined) return null;
  if (/^sharedWorkspaceLockfile:\s*(['"]?)false\1\s*(#.*)?$/m.test(workspaceText)) return null;
  if (/^\s*shared-workspace-lockfile\s*=\s*(['"]?)false\1\s*([#;].*)?$/m.test(npmrcText ?? "")) return null;
  return lockedGenesisVersions(lockText);
}
