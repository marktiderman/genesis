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
