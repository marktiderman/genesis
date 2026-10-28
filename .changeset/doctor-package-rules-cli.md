---
"@marktiderman/genesis-cli": minor
---

Package rules, the primitives catalog and the ratchet.

- **Package rules.** The doctor finds every installed `@marktiderman/genesis-*` package (and every local package) and runs the rules it declares in its package.json under `genesis.doctor`: declarative `prefer` rules ("use X instead of Y": forbidden JSX elements, imports or a pattern, with `unless` exemptions, `platform`, `{routes}` globs) and an optional `plugin` module. Ids are namespaced by package (`ui/lists-use-resource-view`) and work with `rules`, `allow`, `stale-exception` and the new `packageRules` (level, files, exclude, with a required reason). A forbidden element is also flagged where an app wrapper around it is rendered. Declarations are read forward-compatibly: an unknown key, or a rule this CLI can't read, is skipped with a warning, so a newer package never breaks an older app's build. A wrapper counts only where its own component renders the element, and its use only where it is imported from that file. New rules: `package-rules-invalid` (warn), `package-rule-override` (a package rule changed in `rules` without a reason).
- **`package-doctor-declaration`** (packages pack): a published Genesis package must declare its rules, or `{ "enforce": false, "reason": "…" }`.
- **Ratchet.** `newOnly` on package rules and app patterns, or `doctor.ratchet` (`true` or rule ids): with `--base`, findings in files unchanged since the merge base drop to `info`. `allow-grew` fails an `allow` entry the base ref's config didn't have, so the list only shrinks. `ratchet-skipped` says when git can't compare; `rules` sets both. Without `--base` nothing changes.
- **`contracts-stale`** (supabase pack, with `doctor.contracts`): the generated contract matches what `genesis introspect` would write now; skipped (info) without the database variable or for a contract generated from OpenAPI, and never run by the Vite plugin (build or dev). Line endings don't count, here and in `genesis introspect --check`.
- **`genesis primitives [--json]`** prints the catalog (need, what to use, import, rule, docs) from every installed package's declarations plus a short static core; **`genesis agents [--check]`** writes it as `.claude/skills/genesis/SKILL.md` and a marked block in AGENTS.md, and **`agent-guide-stale`** warns when they drift or the AGENTS.md markers are broken (then `genesis agents` writes nothing). The report prints `Primitives: N rules from M packages; see genesis primitives`.

Features: doctor-package-rules
