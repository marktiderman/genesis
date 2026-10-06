---
"@marktiderman/genesis-ui": minor
---

**A stat cards row in the header, and status chips that carry counts or sit in a tab strip.**

Purely additive — every new prop and option is optional and defaults to today's rendering, so no existing call site changes. Per `docs/FRAMEWORK.md` rule 5 and the versioning policy ("additive surface is a minor"), this is a **minor**.

- **`PageHeader.stats` / `DataPageShell.stats`.** A `ReactNode` row rendered full width directly under the title block and above `details` (the filters, in the shell's collapsible branch). Layout-only — pass `<StatCard>`s. It renders only when the new `PageHeaderOptions.showStats` resolves true, which **defaults to `false`**, so a page that gains `stats` shows nothing new until the developer or the user turns it on. The option joins the in-header "Header options" popover as **Stat cards**, offered only when the header actually has stats, and persists under `optionsStorageKey` like the other toggles.

- **`DataFilters.statusChips.options` accepts objects.** `Array<string | { value; label?; count? }>` — plain strings keep working and render exactly as before; an object renders its `label` (falling back to `value`) with `count` as a muted number after it. Selection toggles by `value`. Chips now also report `aria-pressed`, and carry `data-testid="status-chip-<value>"`.

- **`DataFilters.statusChips.variant: "chips" | "tabs"`.** `"tabs"` (default `"chips"`) renders the same options as one segmented strip — `role="group"`, `aria-label="Status"`, the border-and-fill look `ViewToggle` already uses — on its own row above the search row. Selection stays multi-select; each segment reports `aria-pressed` and carries `data-testid="status-tab-<value>"`.

New exported types from `/data`: `StatusChipOption`, `StatusChipsVariant`.

The tarball now also ships `SKILL.md`, an agent-facing guide to the ladder, the layer contract, and which export to reach for first.
