---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-ui": patch
---

Doctor: a sanctioned path for defensible customizations, one finding per element, and a ratchet that counts.

- **Declared extensions.** `doctor.extend: [{ rule, file, buildsOn, reason, upstream? }]` records a file that builds on a Genesis primitive or extension point in a way a rule doesn't recognize. Unlike `allow` (debt, which only shrinks), an extension never expires and `allow-grew` and `rules-weakened` don't count it; under `--base` a new one is reported as `extension-added` (info) with its reason, for the pull request's review. The doctor checks it: `reason` needs at least six words and 40 characters, `file` is one file (no globs), `extension-invalid` (error) refuses an extension whose file doesn't import `buildsOn` from a Genesis package, whose `buildsOn` is what a package rule replaces, or that the doctor flags in that file (a deprecated import), and `stale-extension` (warn) reports one whose file no longer has the finding. (The key is `extend` because `extensions` already lists the file extensions to scan.)
- **One finding per element.** Findings of different rules on the same file, line and subject (an app's own rule and a package rule on the same element) are reported once, at the higher level, with every rule id in the finding's new `rules` field and in the report.
- **Count-based ratchet.** Under `--base`, a ratcheted rule's findings keep their level only in a new file or in a file that now has more of them than at the merge base; an edit to a file with old debt no longer makes all of it due. The base counts come from the changed files as they were at the merge base (the checks that read the app's files run again on them; the build, the database contract and Figma don't). When git can't read them, a changed file keeps every level, as before.
- **Package rules:** `unless.renders` follows an imported app component one level, the way `forbid` does, so a screen that renders an app component whose own body renders `BuilderLayout` is exempt.
- **genesis-ui:** `ui/records-use-record-view` no longer flags `ResourceHeader` and `AppShellPageHeader`, Genesis's own parts for the page around one publishable thing; it still flags `DetailPage`.
