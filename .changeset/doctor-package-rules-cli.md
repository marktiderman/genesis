---
"@marktiderman/genesis-cli": minor
---

Package rules, the primitives catalog and the ratchet.

- **Package rules.** The doctor finds every installed `@marktiderman/genesis-*` package (and every local package) and runs the rules it declares in its package.json under `genesis.doctor`: declarative `prefer` rules ("use X instead of Y": forbidden JSX elements, imports or a pattern, with `unless` exemptions, `platform`, `{routes}` globs) and an optional `plugin` module. Ids are namespaced by package (`ui/lists-use-resource-view`) and work with `rules`, `allow`, `stale-exception` and the new `packageRules` (level, files, exclude, with a required reason). A forbidden element is also flagged where an app wrapper around it is rendered. New rules: `package-rules-invalid`, `package-rule-override` (a package rule changed in `rules` without a reason).
- **`package-doctor-declaration`** (packages pack): a published Genesis package must declare its rules, or `{ "enforce": false, "reason": "…" }`.
- **Ratchet.** `newOnly` on package rules and app patterns, or `doctor.ratchet` (`true` or rule ids): with `--base`, findings in files unchanged since the merge base drop to `info`. `ratchet-skipped` says when git can't compare. Without `--base` nothing changes.
- **`contracts-stale`** (supabase pack, with `doctor.contracts`): the generated contract matches what `genesis introspect` would write now; skipped (info) without the database variable, and in the Vite dev server.
- **`genesis primitives [--json]`** prints the catalog (need, what to use, import, rule, docs) from every installed package's declarations plus a short static core; **`genesis agents [--check]`** writes it as `.claude/skills/genesis/SKILL.md` and a marked block in AGENTS.md, and **`agent-guide-stale`** warns when they drift. The report prints `Primitives: N rules from M packages; see genesis primitives`.

Features: doctor-package-rules
