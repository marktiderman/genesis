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
// ('@marktiderman/genesis-features@0.8.0 || 0.8.1', which pnpm 11 honours for a resolving and a
// frozen install), in the place of its first entry; with the lockfile's versions, a version it no
// longer resolves is dropped (and an entry left with none), so the list doesn't grow forever. Every
// other entry is the app's own and kept as it is, a pattern ('@marktiderman/genesis-*') or a bare
// name included. Other lines, comments and order are kept, and the text is unchanged when there is
// nothing to merge or drop.

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

// '@marktiderman/genesis-x@1.0.0 || 1.1.0' -> { name, versions }; null for anything else.
function genesisPins(entry) {
  const at = entry.startsWith("@") ? entry.indexOf("@", 1) : entry.indexOf("@");
  if (at === -1) return null;
  const name = entry.slice(0, at);
  if (!GENESIS.test(name)) return null;
  const versions = entry.slice(at + 1).split("||").map((v) => v.trim());
  return versions.every((v) => PLAIN.test(v)) ? { name, versions } : null;
}

function unquoteScalar(raw) {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

// `items` is [{ raw, entry }]; returns, in order, { index, text } for each item kept: text null keeps
// it as written, else it is a Genesis package's merged entry (at its first item; none when no
// version is left).
function mergePins(items, locked) {
  const byName = new Map();
  const out = [];
  items.forEach((item, index) => {
    const pins = genesisPins(unquoteScalar(item.entry));
    if (!pins) { out.push({ index, raw: item.raw }); return; }
    let slot = byName.get(pins.name);
    if (!slot) { slot = { index, name: pins.name, versions: new Set(), first: pins.versions.join(" || "), count: 0 }; byName.set(pins.name, slot); out.push(slot); }
    slot.count++;
    for (const v of pins.versions) slot.versions.add(v);
  });
  return out.flatMap((o) => {
    if (!("name" in o)) return [{ index: o.index, text: null }];
    const keep = [...o.versions].filter((v) => !locked || locked.get(o.name)?.has(v)).sort(compareVersions).join(" || ");
    if (!keep) return [];
    // A lone entry that already says this is left exactly as written.
    return [{ index: o.index, text: o.count === 1 && keep === o.first ? null : `'${o.name}@${keep}'` }];
  });
}

// `locked` (from lockedGenesisVersions) is the lockfile's versions; without it nothing is dropped.
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
    const kept = mergePins(raws.map((raw) => ({ raw, entry: raw })), locked).map((m) => m.text ?? raws[m.index]);
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
    body.push({ item: items.length, m });
    items.push({ raw: lines[i], entry: m[2] });
  }
  const merged = new Map(mergePins(items, locked).map((m) => [m.index, m.text]));
  const kept = body.flatMap((b) => {
    if (!("item" in b)) return [b.line];
    if (!merged.has(b.item)) return [];
    const replacement = merged.get(b.item);
    return [replacement === null ? items[b.item].raw : `${b.m[1]}${replacement}${b.m[3] ?? ""}`];
  });
  // Every entry dropped: an empty list, not a null one.
  const keyLine = items.length && merged.size === 0 ? "minimumReleaseAgeExclude: []" : lines[start];
  const next = [...out, keyLine, ...kept, ...lines.slice(i)].join(eol);
  return next === lines.join(eol) ? text : next;
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
// null when there is none), unless each project keeps its own (sharedWorkspaceLockfile: false), when
// one lockfile doesn't hold them all and nothing is dropped (null).
export function tidyLocked(workspaceText, lockText) {
  if (lockText === null || /^sharedWorkspaceLockfile:\s*false\b/m.test(workspaceText)) return null;
  return lockedGenesisVersions(lockText);
}
