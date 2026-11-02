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
// ('@marktiderman/genesis-ui@2.26.0'). pnpm 11.1.3 reads that list first match per package name, so
// a second pinned version of one package fails `pnpm install --frozen-lockfile` with
// ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION. Every Genesis entry becomes one name pattern (the umbrella
// its bare name), which pnpm 11 honours for a resolving and a frozen install. Only Genesis's own
// names are touched: every other entry is the app's supply-chain guard. Other lines, comments and
// order are kept, and the text is unchanged when there is nothing to replace.
export const GENESIS_PATTERN = "@marktiderman/genesis-*";

function excludeReplacement(entry) {
  if (entry === GENESIS_PATTERN) return GENESIS_PATTERN;
  const at = entry.startsWith("@") ? entry.indexOf("@", 1) : entry.indexOf("@");
  const name = at === -1 ? entry : entry.slice(0, at);
  if (!GENESIS.test(name)) return null;
  return name === UMBRELLA ? UMBRELLA : GENESIS_PATTERN;
}

function unquoteScalar(raw) {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

export function normaliseReleaseAgeExcludes(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const key = /^minimumReleaseAgeExclude:(.*)$/;
  const start = lines.findIndex((l) => key.test(l));
  if (start === -1) return text;
  const seen = new Set();
  const out = lines.slice(0, start);
  // The flow form on one line: minimumReleaseAgeExclude: ['a', 'b'] # comment
  const flow = /^(\s*)\[(.*)\](\s*(?:#.*)?)$/.exec(key.exec(lines[start])[1]);
  if (flow) {
    const kept = [];
    for (const raw of flow[2].split(",").map((s) => s.trim()).filter(Boolean)) {
      const replacement = excludeReplacement(unquoteScalar(raw));
      if (replacement === null) kept.push(raw);
      else if (!seen.has(replacement)) { seen.add(replacement); kept.push(`'${replacement}'`); }
    }
    return [...out, `minimumReleaseAgeExclude:${flow[1]}[${kept.join(", ")}]${flow[3]}`, ...lines.slice(start + 1)].join(eol);
  }
  // The block form: the key, then its `- entry` lines (blank lines and comments between them kept).
  const item = /^(\s*-\s+)('(?:[^']|'')*'|"[^"]*"|[^#\s][^#]*?)(\s+#.*)?\s*$/;
  out.push(lines[start]);
  let i = start + 1;
  for (; i < lines.length; i++) {
    const m = item.exec(lines[i]);
    if (!m) {
      if (/^\s*(#.*)?$/.test(lines[i])) { out.push(lines[i]); continue; }
      break;
    }
    const replacement = excludeReplacement(unquoteScalar(m[2]));
    if (replacement === null) out.push(lines[i]);
    else if (!seen.has(replacement)) { seen.add(replacement); out.push(`${m[1]}'${replacement}'${m[3] ?? ""}`); }
  }
  return [...out, ...lines.slice(i)].join(eol);
}

// The pnpm-workspace.yaml pnpm reads and writes for an install in `start`: the nearest one at or
// above it, as pnpm finds it (not by the lockfile, which a workspace with
// sharedWorkspaceLockfile: false keeps in each project), else `fallback` (where pnpm would create
// one for a standalone app). `fs` is { exists, join, dirname }.
export function pnpmWorkspaceFile(start, fallback, fs) {
  for (let dir = start; ; ) {
    const file = fs.join(dir, "pnpm-workspace.yaml");
    if (fs.exists(file)) return file;
    const parent = fs.dirname(dir);
    if (parent === dir) return fs.join(fallback, "pnpm-workspace.yaml");
    dir = parent;
  }
}
