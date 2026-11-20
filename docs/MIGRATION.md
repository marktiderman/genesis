# Genesis Migration Guide

Per-version migration notes for `@marktiderman/genesis-{core,design-system,ui,ui-native}`. **Genesis ships breaking changes at minor on 0.x; consumers need this doc to know what changed.** v1.0+ shifts to breaking changes only at major.

This file is appended to (never rewritten) at every release. Newest version on top.

> **Status conventions:**
> 🟢 No action needed — drop-in replacement.
> 🟡 Action recommended — update preferred but not strictly required.
> 🔴 Action required — code will break without changes.

---

## Support settings: one resolver, renumbered migrations, deprecated hooks — `@marktiderman/genesis-support` (migrations 0029 to 0034), `@marktiderman/genesis-supabase` (`0023_genesis_settings_tenant_person.sql`), `@marktiderman/genesis-config` (**minor**)

🟡 **Support's unreleased migrations are renumbered after 0028**, so an app that already applied 0026
and 0028 applies them in order: `0029_genesis_support_desks.sql` (was 0024),
`0030_genesis_support_notifications.sql` (was 0025), `0031_genesis_support_email_reply.sql` (was
0027) and `0032_genesis_support_staff_admin_list.sql` (was 0029). Only apps that copied them from a
pre-release build need to act: rename your copies' files to match, or let `genesis migrate` copy them.

🟡 **Write the manifest again on deploy** (`genesis settings sync`). The catalogue now carries each
key's `defaults` by preset; genesis-supabase 0023's `private.genesis_setting(key, tenant)` resolves a
setting on the server from them (default, preset, file, database, then a tenant-scoped key's tenant
value, with locks), as `resolveSettings` does. Support's server gates read it, so a tenant's
`support.helpCenter` now closes that tenant's help center on the server, not only on screen. Until
the manifest is written again, a key with no `defaults` starts from null and the gates stay on.

🟡 **Deprecated, still honored for one release** (support 0030, 0033, 0034):

- `private.genesis_support_verify_prompt_enabled()`: set `support.verifyPrompt` to true instead.
- `private.genesis_support_setting_int` and `private.genesis_support_setting_bool`: call
  `private.genesis_setting(key, tenant)`. 0020's `_layers`, `_fits` and `_value` are dropped.
- An app's own `private.genesis_support_person_name` or `private.genesis_support_tenant_label`:
  define `private.genesis_person_name(person)` and `private.genesis_tenant_label(tenant)`, which
  support asks first.

🔴 **`private.genesis_support_requester_label(report)` is no longer called** (support 0034, the
support-chat block). Define the set-based hook instead; the one-ticket hook can be its body:

```sql
create function private.genesis_support_requester_labels(reports uuid[])
returns table (report_id uuid, label text) language sql stable set search_path = '' as $$
  select r, private.genesis_support_requester_label(r) from unnest(reports) r
$$;
revoke execute on function private.genesis_support_requester_labels(uuid[]) from public, anon, authenticated;
```

🟢 `support.email` is no longer marked planned (the inbound route reads it). The `sentry` and
`ai.key-budget` setup steps no longer offer to save a setting nothing reads; `github.issues` saves
the repository to `support.githubRepo`.

## Settings: tenant and person values, Realtime refresh — `@marktiderman/genesis-supabase` (migration `0023_genesis_settings_tenant_person.sql`), `@marktiderman/genesis-config` (settings protocol) (**minor**)

🟡 **To get tenant and person values, apply migration 0023** (`genesis migrate` copies it), if your
app uses the settings block. `readSettingsLayers` and `resolveAppSettings` (and so
`watchAppSettings`) now ask `genesis_settings_layers(tenant)`, which 0023 adds. Until it is applied
they read 0020's layers as before, resolve without tenant and person values, and say so once in the
console, so deploying this version first breaks nothing. 0020's `genesis_settings_layers()` stays as
it was, so SQL and Edge Functions that call it keep working.

🟡 **Check what `resolveAppSettings` now reads.** Without `tenant` or `person` in its options it
resolves with the stored tenant layer (of `tenantId`, when given) and the signed-in person's own
values, where it used to resolve with none. Passing `tenant` or `person` still replaces the stored ones.

🟢 Tenant admins can set tenant-scope keys only once your app has `private.genesis_tenant_admin(tenant,
person)` (the tenant-features hook); without it, tenant writes are refused. Add the foreign key from
`genesis_tenant_settings.tenant_id` (and `genesis_scoped_setting_changes.tenant_id`) to your tenant
table, as the migration's header shows. 0023 adds a policy on `realtime.messages`
(`genesis_settings_listen`) for its private channels; a project without Realtime is unaffected.

---

## Support staff: platform admins handle tickets when the app names no staff — `@marktiderman/genesis-support` (migration `0023_genesis_support_hook_defaults.sql`; **minor**)

🟡 **Check who your staff are** if your app defines `private.genesis_platform_admin(person)` (the
settings block's hook, genesis-supabase 0020) and **not** `private.genesis_support_staff(person)`.
Support asks `private.genesis_support_staff_hook(person)`, and from 0023 that answers with your
platform admins when the app has no staff hook of its own. So the moment 0023 is applied (or the
moment you add `genesis_platform_admin` after it), every platform admin can read, answer, assign
and close every ticket, and read the context dumps sent with them. An app with neither hook has no
staff, as before; an app with its own `genesis_support_staff` is not affected.

If your platform admins shouldn't handle tickets, add the staff hook in a migration of your own
(it wins over the default whenever it exists). On a live app, apply it **before** 0023: added after,
it removes the fallback from then on, but can't undo what platform admins could read in between.

```sql
create or replace function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.support_team t where t.user_id = person)
$$;
revoke execute on function private.genesis_support_staff(uuid) from public, anon, authenticated;
```

---

## Settings: `preset` and `settings` in genesis.config.json — `@marktiderman/genesis-config` (settings), `@marktiderman/genesis-cli` (**minor**)

🟢 **No action needed**, unless your genesis.config.json already has a top-level `preset` or
`settings` key of your own. Genesis now reads both: `preset` is `max` (the default), `standard` or
`min`, and `settings` is the app file's layer of Genesis settings (`"namespace.key": value`, or
`{ "value": …, "locked": true }`). A value that isn't that shape is ignored, every command still
runs, and `genesis doctor` reports it (`invalid-setting`): rename your key (to `appPreset` or
`appSettings`, say) and update what reads it.

---

## `@marktiderman/genesis-features` is now `@marktiderman/genesis-config` — genesis-features 0.10 (deprecated alias), genesis-config 0.10, genesis-cli (rename; **minor**)

🟡 **Action recommended.** The feature registry package is renamed in place: the same source, exports
and subpaths (`.`, `/blocks`, `/gate`, `/gate/react`, `/node`, `/react`) publish as
`@marktiderman/genesis-config`. `@marktiderman/genesis-features` is a thin, deprecated re-export of
it for two minor versions (0.10 and 0.11), then goes.

```bash
npx genesis codemod genesis-features-renamed-genesis-config   # or genesis upgrade, which runs it
```

The codemod rewrites the imports (and subpaths), the dependency in each package.json, `overrides` /
`pnpm.overrides` / `resolutions` keys, `tsconfig*.json` paths and `pnpm-workspace.yaml`, and lists
whatever still mentions the old name. `genesis doctor` reports any import left (`deprecated-import`).
Feature ids, `features.ts`, `features.json`, `flags.json` and the generated AGENTS.md block keep their
format.

- **Move both together.** The Genesis packages that depended on genesis-features (chat, native,
  notifications, product, sites, supabase, support, the genesis umbrella, genesis-cli) now depend on
  genesis-config. An app that takes their new releases while still on genesis-features 0.9.x carries
  two copies of the registry and gate (0.9's own code, and genesis-config): gate snapshots and
  `BlockDef`s still interoperate (plain data), but take the alias (0.10+) or run the codemod in the
  same upgrade so there's one copy.
- **Not the same as the old config schema.** "genesis-config" already names
  `schema/genesis-config.schema.json` and `scripts/validate-genesis-config.mjs` (the CI gates file,
  below). They are unrelated to the package.

---

## The responsive contract: lists answer to their own width, rows and cards open from their own button — `@marktiderman/genesis-ui` 3.0.0 (**major**), `@marktiderman/genesis-support` (minor), `@marktiderman/genesis` (minor)

The components now hold the rules in [RESPONSIVE.md](./RESPONSIVE.md). Several change how existing
API behaves, so this is a major. Packages that peer-depend on genesis-ui take 2.x and 3.x, and
`@marktiderman/genesis`, which re-exports it, is a minor.

🔴 **Action required where your tests or code relied on the old behaviour:**

- **Default list rows and cards aren't buttons.** A default `ResourcePage` list row or card no
  longer has `role="button"` and a tab stop of its own. A row opens from its Open button
  (`resource-list-row-open`, named "Open …"), and a card from its title (`resource-card-open`). A
  click elsewhere on either still opens it, and a click on a link or control inside never does.
  Tests that found a row by `getByRole("button", { name: title })`, or pressed Enter on the row,
  should click the Open button or the card's title instead. A custom `renderCard` is unchanged.
- **`phoneMode` covers embedded lists.** An app with `ResourceViewDefaultsProvider phoneMode`
  sees its embedded lists open as rows or cards on phones and in narrow panels (a list's own
  frame under 40rem). A list that must stay a table there sets `mode="table"`. A person's own
  pick of view still wins.
- **Side sheets are full width on phones.** A right or left `SheetContent` you gave a plain `w-*`
  is full width below `sm`. Add `max-sm:w-*` to keep it narrow (a navigation drawer).

🟡 **Check, no change needed in most apps:**

- **Lists are measured.** `ResourceView` measures the list's root (DataPageShell's new `rootRef`).
  A list that is narrow on a wide screen (a side panel) now takes its narrow default too. Lists
  outside a `ResourceView` still follow the viewport.
- **PageHeader actions wrap.** Beside 10rem of title (its icon included) they keep their size and
  the title truncates, as before. When they can't fit, they take their own line and wrap.
- **Touch spacing grows.** On coarse pointers, Switch, Checkbox, RadioGroupItem, Chip and
  ChipGroupItem take an invisible 44px hit area (`touchTarget`). RadioGroup and ChipGroup space
  their items, unless you set a gap. DataTable's selection column is 56px, so pinned columns move
  16px and its minimum width grows.
- **A gallery view's list and table** no longer get the gallery's item click; rows open once,
  from their own button.
- **`scrollRoot="window"` sets the page's scroll padding.** While mounted, AppShell writes an
  inline `scroll-padding-top`/`-bottom` on `<html>` for its bars, which overrides a
  `scroll-padding` rule of the app's own on `html`.

🟢 **New, optional:** `touchTarget` (beside `cn`), `useListWidth` and `LIST_NARROW_REM`
(`hooks/use-list-width`), `keepInList` on a ResourcePage column (ResourceView sets it for
`cells`), DataPageShell `rootRef`, and `SupportMessengerLauncher variant="icon"` for a phone
header. In the app's viewport meta, `interactive-widget=resizes-content` makes the on-screen
keyboard resize the page in Chrome and Firefox.

---

## Light and dark is the person's appearance; widgets replace hand-fetched stat tiles — `@marktiderman/genesis-core`, `@marktiderman/genesis-design-system`, `@marktiderman/genesis-ui` (**minor**)

🟢 **No action needed.** Everything below is additive; existing props and exports work as before.

- **Words.** What `GenesisThemeProvider` and `ThemeMode` hold (light, dark or system) is the person's **appearance** (ADR 0024, the glossary). The props keep their `mode` names. New names for the same things: `Appearance` and `ResolvedAppearance` (types, design-system), and `AppearanceProvider` (genesis-ui/themes), which is `GenesisThemeProvider` fed from the person's appearance preferences. "Theme" now means the app theme (ADR 0018), never light and dark.
- **Save the person's appearance and density** (🟡 recommended where an app keeps them in local storage by hand): define where they're kept with `defineAppearancePreferences({ store })` (genesis-core), wrap the app in `AppearancePreferencesProvider`, and swap `GenesisThemeProvider` for `AppearanceProvider`. `AppShell`'s theme toggle and density then follow the person across devices. A controlled `GenesisThemeProvider` can save `setMode` itself with the new `onModeSelect`.
- **Organization brands:** set `WorkspaceTheme.brand` to an app brand's id and read it with `resolveWorkspaceBrand`.
- **Dashboards** (🟡 recommended): a `StatCard` whose number a screen fetched by hand becomes a `defineWidget` over the view it counted, drawn with `<Widget>` in the `DashboardPage`'s `stats`. `StatCard`, `HeadlineNumbers` and `SummaryCard` keep their props and markup, and now carry the widget tile's parts (`stat-card`, `headline-number`, `summary-card`, `widget-label`, `widget-value`, `widget-detail`), so an app style can change them.

---

## New doctor findings from release 2026-11-03/a — what to do about each

🟡 **Action recommended.** These landed on existing code, and an app may have allowed them to take
the release. Run the codemods, handle the other two by hand, then remove the `doctor.allow` entries
(`stale-exception` names the ones left).

| Finding | Fix | How |
| --- | --- | --- |
| `ui/overlays-fit-the-phone` | **Codemod:** `genesis codemod genesis-ui-overlays-fit-the-phone` | In files that import `@marktiderman/genesis-ui`, drops a `max-h-[…vh]` of 80 or more from `DialogContent`, `AlertDialogContent` and `SheetContent` (they cap themselves to the screen and scroll inside) when the tag has no other cap, no height of its own and isn't a bottom sheet, and moves anything else in `vh` to `dvh`. A tag with `>` in a prop (an arrow function before `className`) is left for you, and the rule still reports it. A long form may want `mobileLayout="fullscreen"`. |
| `haptics-use-genesis` | **Codemod:** `genesis codemod genesis-ui-native-haptics` | In files with `import * as Haptics from "expo-haptics"`, turns each call into `playHaptic(Haptics, "light")`, which works anywhere and never throws. It prints the files it can't finish: a `Soft` or `Rigid` style or one in a variable (Genesis's kinds are light, medium, heavy, select, success, warning and error), a call chained with `.then` or `.catch`, and named imports. Inside a component, `useHaptics()` is the shorter form, with expo-haptics passed once as `GenesisModules.haptics`. |
| `shadowed-export` (`GalleryCard`, `Lightbox`) | **By hand.** No codemod | A hand-built component rarely has the same props, states or markup as the Genesis one, so the swap needs someone to compare them. Replace yours with the Genesis export where it fits, extend it with its slots and variants where it nearly does, or rename yours if it's a different thing. `genesis upgrade` names each one a release adds. |
| `deprecated-import` on `persistQueries` | **By hand.** No codemod | The switch opens a database the app has to create, moves from query keys to resource names, starts from an empty cache and needs a decision about what may sit on the device. expo-sqlite is a native module too, so it can need a new native build. See the next section. It's ratcheted (under `--base`, unchanged files report it as `info`) and stays until the next major. |

---

## `persistOffline` replaces `persistQueries`: lists open instantly from the device — `@marktiderman/genesis-core` (`/offline`), `@marktiderman/genesis-native` (deprecation; **minor**)

🟡 **Action recommended.** `persistQueries` (genesis-native `/persist`) saves the allowed queries to
async storage as one blob. It's deprecated and stays until the next major. `persistOffline` keeps
each record once, per person and workspace, in SQLite on the phone and IndexedDB on the web, and
restores lists and records before the screens first render.

| Before | After |
| --- | --- |
| `persist={persistQueries({ storage: AsyncStorage, keys: ["tasks"], buster })}` on `GenesisNativeApp` | `persist={persistOffline({ cache: sqliteLocalCache({ db }), resources: ["tasks"], buster })}`, both from `@marktiderman/genesis-native/offline`, with `db` from expo-sqlite's `openDatabaseSync` |
| No device cache on the web | `<GenesisProvider persist={persistOffline({ cache: indexedDbLocalCache(), resources, buster })} persistScope={cacheScope(user.id, workspaceKey)}>` (`@marktiderman/genesis-core/offline`) |

**On the phone this can't always ship as an OTA update.** `sqliteLocalCache` needs expo-sqlite, a
native module. If the app's installed builds don't include it, add it and make a new native build,
and let that reach people before an update that calls `openDatabaseSync`: on an older build, the
module isn't there. The web path needs no such step.

Keep `resources` to what may sit on a device unencrypted. The first start after the switch begins
with an empty cache, and the old blob is no longer read: remove it with `AsyncStorage.removeItem("genesis-query-cache")`.

---

## A feature's `kind` replaces `layer` — `@marktiderman/genesis-features` 0.8, `@marktiderman/genesis-cli` (deprecation; **minor**)

🟡 **Action recommended.** In your `features.ts`, rename each feature's `layer:` to `kind:` (same
values; write `"element"` where it says `"primitive"`). `layer` is read as a kind until the next
major, and `features check` warns on each one. After that, `layer` means the layer of the package
that owns the feature (foundation, primitive, module or tooling), derived from its `entry` or
`links.code`, never written.

| Before | After |
| --- | --- |
| `layer: "pattern"` in features.ts | `kind: "pattern"` |
| `FEATURE_LAYERS`, `FeatureLayer` | `FEATURE_KINDS`, `FeatureKind` |
| `findFeatures(…, { layer })` | `findFeatures(…, { kind })` |
| `genesis features find --layer element` | `genesis features find --kind element` |
| a block's `feature.layer` | `feature.kind` |


New: `genesis features find --layer foundation|module|tooling` and `featurePackageLayer()`.

---

## Record pages are record views; workspaces — `@marktiderman/genesis-core` 2.2, `@marktiderman/genesis-ui` 2.24 (deprecation; **minor**)

🟡 **Action recommended.** A record's page is now a **record view**, so "workspace" can mean
where the viewer is working ([ADR 0004](./adr/0004-workspaces.md)). The old names work for one
more minor release, marked deprecated, then go.

| Before | After |
| --- | --- |
| `defineWorkspace(view, …)` | `defineRecordView(view, …)` (`genesis-core/resource-view`) |
| `<ResourceWorkspace workspace={…} />` | `<RecordView view={…} />` (`genesis-ui/data`) |
| `<NativeResourceWorkspace workspace={…} />` | `<NativeRecordView view={…} />` (`genesis-ui-native/data`) |
| `getNativeResourceWorkspaceStackOptions` | `getNativeRecordViewStackOptions` |
| `Workspace…` types (`WorkspaceDefinition`, …) | `RecordView…` types |
| doctor rule `ui/record-pages-use-resource-workspace` | `ui/records-use-record-view` |

The props are otherwise the same: `row`, `section`, `sectionHref`, `can`, `onAction`, `slots`,
`lists`. Message keys (`messages.workspace`) and default test ids (`resource-workspace`) are
unchanged. A hand-built record page with tabs (the doctor's `ui/records-use-record-view`) moves to
`defineRecordView` + `<RecordView>`; see [RESOURCE-VIEW.md](./RESOURCE-VIEW.md#recordview).

🟢 **New, nothing to change:** `Workspace` now means where the viewer works: a tenant, a roll-up
or personal (`genesis-core/workspaces`). An app with organizations wraps its routes in
`<WorkspaceScope workspaces pathname>` (`genesis-core/hooks`) in place of `ViewerScope`, and puts
`<WorkspaceSwitcher>` (`genesis-ui/layout`) in `AppShell`'s `headerSlot`. Views with
`scope: ["org_id"]` follow the switcher with no change. A working example is the demo app at
[genesisone.dev/demo](https://genesisone.dev/demo) (`apps/sample/app/routes/demo.tsx`).

## Scope-neutral names — `@marktiderman/genesis-core` 2.0, `@marktiderman/genesis-ui-native` 3.0 (breaking; **major**)

🔴 **Action required** for apps that use a practice clock or `practiceTimeZone`. Run the codemod:
`genesis upgrade` runs it when genesis-core crosses 2.0.0, or run it by hand:

```bash
genesis codemod genesis-core-2-scope-names --dry-run   # lists the files
genesis codemod genesis-core-2-scope-names
```

Genesis's scope and clock APIs used one app's word for its tenant ("practice"). They now name
whatever the screen is scoped to, so an organization, a location, a league or a team reads the same.
The umbrella `@marktiderman/genesis` takes a **minor** for the same break (it is on 0.x).

| Before | After | Codemod |
| --- | --- | --- |
| `ResourceScope.practiceId` (a named key) | the app's own key in the open slot: `scope={{ practiceId }}` still passes it; `scope={{ orgId }}`, `scope={{ leagueId }}` are as good | Nothing to rewrite. When a file reads `practiceId`, it prints the augmentation below |
| view field `timeZone: "practice"` | `timeZone: "scope"` | Rewritten |
| NativeResourceView `practiceTimeZone="…"` | `scopeTimeZone="…"` (or set `scopeTimeZone` on `ViewerScope` once) | Rewritten |
| `resolveZone("practice", zones)`, `DisplayTimeZones.practice` | `resolveZone("scope", zones)`, `DisplayTimeZones.scope` | Rewritten: `resolveZone`, a `{ viewer, practice }` object's key, and `.practice` on a value from `useDisplayTimeZones()` or typed `DisplayTimeZones` |

- **Typing an app key.** `ResourceScope` keeps its open slot, so `scope.practiceId` is `unknown`
  without a declaration. Declare the app's keys once (module augmentation, as for
  `GenesisViewerRoles`):

  ```ts
  declare module "@marktiderman/genesis-core" {
    interface ResourceScope {
      practiceId?: string;
    }
  }
  ```

- **A missed rename fails loudly, never on the wrong clock.** The old names are gone, with no
  aliases (Mark: "old names don't have to keep working … lets ensure its clean and accurate"):
  - `timeZone` is a closed type (`"viewer" | "scope" | TimeZoneName`), so `timeZone: "practice"` is
    a type error, and `defineView` throws `ViewDefinitionError` on it when the view loads
    (naming the codemod), as it does for any zone the runtime doesn't know.
  - `practiceTimeZone` on NativeResourceView and `DisplayTimeZones.practice` are type errors;
    `resolveZone("practice", …)` throws.
  - A `scopeTimeZone` the runtime doesn't know throws in development and is reported
    (`reportError`) in production, before the viewer's clock is used.
  - `genesis doctor`'s `removed-scope-name` rule (error) lists every one left, so `doctor
    --strict` fails in CI until the codemod has run; `scope-practice-id` (info) notes an untyped
    `scope.practiceId` read.
- **New:** `ViewerScope`'s `scopeTimeZone` (`useViewerScope().scopeTimeZone`) is the scope's clock.
  `timeZone: "scope"` columns read on it on the web as well; before, the web drew a practice-clock
  column on the viewer's clock.
- **No other package needed changing.** chat, switchboard, forms-native, forms-studio,
  notifications, studio, product and support now accept genesis-core 2 and genesis-ui-native 3 as
  peers beside the versions they accepted before (a patch each).

---

## `@marktiderman/genesis-ui` — `Tooltip`, `Tabs` and `ScrollArea` move to Radix (breaking behavior; **major** semver bump)

🔴 **Action required** — nothing needs editing to *compile*, but working code can stop working. Read the three checks below before upgrading.

Both senses of "major" apply here and they agree. `docs/README.md` fixes the rule — *"Genesis ships breaking changes at **minor on 0.x** and **major on 1.x+**"* — and `genesis-ui` is on **1.x** (1.3.0 as this is written), so a breaking change takes a **major**. The 0.x-ships-breaking-at-minor half of that rule does not apply to this package. It *does* apply to the umbrella `@marktiderman/genesis`, which is on 0.x and therefore takes a **minor** for the very same break — the two different bump levels in this release are the same policy, not a contradiction.

Step 5 of the `docs/FRAMEWORK.md` migration sequence. These were the last three primitives hand-rolling behavior Radix already solves.

**Every existing prop, export and type stays source-compatible.** Two optional props are added — `Tooltip`'s `delayDuration` (pointer-hover delay, default `0`) and `ScrollArea`'s `viewportProps` (addresses the inner viewport, and is the fix for the `ref` break below) — plus `orientation` / `dir` / `activationMode` pass-throughs on `Tabs`. What changed beyond that is the DOM these three render, how they respond to pointer, keyboard and assistive tech, and **which element `ScrollArea`'s `ref` usefully addresses**.

`radix-ui` (the unified package) is a **new required peer dependency** — add it alongside the existing Radix peers.

### The three things that can break

1. **`ScrollArea` no longer scrolls on the element you hold a ref to.** The root is now `overflow: hidden` and scrolling happens on an inner `[data-radix-scroll-area-viewport]`. `ref.current.scrollTop = …`, `ref.current.scrollTo(…)` and `ref.current.scrollHeight` all target the root, which never scrolls — silently, with no error. Anything that scrolls a log, chat pane or long list programmatically must reach the viewport instead, via the new `viewportProps`:

   ```diff
   - const ref = useRef<HTMLDivElement>(null);
   - <ScrollArea ref={ref}>{rows}</ScrollArea>
   - ref.current.scrollTop = ref.current.scrollHeight;
   + const viewportRef = useRef<HTMLDivElement>(null);
   + <ScrollArea viewportProps={{ ref: viewportRef }}>{rows}</ScrollArea>
   + viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
   ```

   `onScroll`, `onScrollCapture` and `nonce` are routed to the viewport **for you** — they have no other correct destination. `scroll` does not bubble, so an `onScroll` left on the root would never fire once; and Radix reads `nonce` only on the viewport, where it spends it on the `<style>` that hides the native scrollbar. Anything else that must address the scroller (`tabIndex`, an `id`) goes through `viewportProps`. Everything else still lands on the root.

2. **`Tabs` selects on `mousedown`, not `click`.** Real pointer use is unaffected (mousedown precedes click). Tests are not: `fireEvent.click(tab)` no longer changes tabs — use `fireEvent.mouseDown(tab, { button: 0 })`, or `userEvent.click`, or activate via keyboard.

3. **`Tooltip`'s bubble is portalled to `document.body` and does not exist while closed.** Any selector, snapshot or `getByRole("tooltip")` that assumed an always-present bubble inside the trigger's wrapper needs to open the tooltip first (focus or hover the trigger) and query from `document.body`.

### Also worth checking

- **`ScrollArea` nests content two levels deeper**, inside the viewport and then a `min-width:100%; display:table` sizing wrapper. A direct-child selector (`.my-scroller > .row`) stops matching, a child with `height: 100%` no longer resolves against the scroller, and former flex children are no longer flex children of anything.
- **`ScrollArea` scrollbars now render on Firefox.** They previously fell back to the OS scrollbar because the old styling was `::-webkit-scrollbar`-only. Intended, but visible.
- **`Tabs` tab order changes.** The triggers become a single roving tab stop (Arrow/Home/End move between them) and each visible panel is focusable per the ARIA pattern. Keyboard-driven E2E flows need re-recording.
- **`Tabs` active styling moved to `data-[state=active]:` variants.** Visually identical, but every trigger now carries the same class string, so `classList.contains("bg-background")` on the active trigger no longer discriminates — read `data-state` instead.
- **`Tooltip` triggers must be a single element that forwards its ref to a DOM node.** A function component that swallows `ref` will not anchor or open properly. Bare text, a fragment, or several children still work (they get a `<span>` wrapper) but, as before, are not keyboard-reachable.
- **`Tooltip.aria-describedby` is now present only while open**, which is the correct ARIA behavior; it used to be permanently set. An `aria-describedby` you set yourself on the trigger is preserved and unioned with the tooltip's, not replaced.
- **`Tooltip` carries your theme across the portal.** The bubble mirrors the nearest ancestor's `data-theme` onto itself, so `[data-theme="dark"]`-scoped variables still resolve on a portalled bubble. The portal target is `document.body`, so a class-based scheme on `html` or `body` (`.dark`, `.theme-dark`) **still applies** and needs no change. The only case that escapes is a non-`data-theme` scope on an ancestor *below* `body` — an app-root `<div class="dark">`, say. For that, either move the class to `html`/`body`, or scope by `data-theme` (what `GenesisThemeProvider` emits).
- **`Tooltip` animates on entrance where it previously did not**, honouring `prefers-reduced-motion` via `motion-reduce:` variants.
- **All three now carry `"use client"`.** They were already interactive, so a Next.js server component can still import them — but they land in the client bundle.

### What you get for it

Portalled, collision-aware tooltips with dismissal and an opt-in `delayDuration`; the complete WAI-ARIA tabs pattern (roles, `aria-selected`, `aria-controls`/`aria-labelledby`, roving `tabindex`, Arrow/Home/End with wrap-around, disabled triggers skipped); and one scrollbar implementation that looks and behaves the same in every browser.

---

## `@marktiderman/genesis-data` — demoted-table cleanup in `scaffold()` (patch)

🟡 **Action recommended** — `genesis-data init` / `scaffold()` behavior changed; review console output after upgrading if your repo has ever run PR #271's core/genesis-only reshuffle.

Follow-up to PR #271 (which moved `harness-uses`/`harness-blocks`/`skills` out of `core:` into `genesis-only:`, and `agents`/`principles`/`library`/`research` the other way). Before this release, `scaffold()` only ever ADDED core contracts — a tenant that had already scaffolded a table before it was demoted kept that table's stale `data/_schema/tables/<t>.yml` and `data/<t>/` trellis forever, still validated by the roller as if still shipped. `scaffold()` now detects every demoted-but-still-recognized table and either:

- **removes** the stale schema file + trellis dir, when the tenant never put real content there — a bare `.gitkeep` and/or an untouched pristine default `_template.md` only — reported in `ScaffoldSummary.demotedRemoved`; or
- **keeps it in place with a loud console warning**, when the tenant has real rows and/or a genuinely customized template — reported in `ScaffoldSummary.demotedKept`. Row-safe: tenant content is never silently deleted.

### What this means for consumers

- Re-run `genesis-data init` (or your `postinstall`/CI step that calls `scaffold()`) after upgrading, and read the console summary — or the new `demotedRemoved`/`demotedKept` arrays if you call `scaffold()` programmatically.
- If a table you cared about shows up under `demotedKept`, migrate/archive its rows manually, then remove `data/_schema/tables/<t>.yml` and `data/<t>/` yourself once done.
- `ScaffoldSummary.demotedRemoved` / `.demotedKept` are **optional** fields — existing code that constructs or mocks this exported type against the pre-existing shape keeps type-checking.

---

## v0.3.x → v1.0 — npm scope rename (old scope → `@marktiderman`) + `genesis-ui` v2.0 (router-agnostic)

🔴 **Action required** — imports break without changes.

First `@marktiderman`-scoped publish. Versions: umbrella `@marktiderman/genesis` `1.0.0`; `-ui` `2.0.0`; `-core` / `-design-system` / `-cli` / `-switchboard` `1.0.0`; `-ui-native` `0.2.0`. Two breaking changes ship together.

### What changed

1. **npm scope rename** — every package moved from the old pre-public scope's `genesis-*` names to `@marktiderman/genesis-*`. The data-layer package also shortened its name: `genesis-data-switchboard` → `@marktiderman/genesis-switchboard` (dropped the redundant `data-` prefix).
2. **`genesis-ui` is now router-agnostic** — the hard `react-router` peer dependency is gone, so the package consumes cleanly from Next.js (or any framework, or none). Components that imported the router directly now take an injectable navigation abstraction and default to plain browser behavior (`<a>` / `window.location`).

### What this means for consumers

- **Everyone:** update every import specifier and dependency entry to the `@marktiderman/*` names (and `-data-switchboard` → `-switchboard`). The old pre-public-scope packages will be `npm deprecate`d with a pointer once the new ones publish. (The legacy `genesis@2.0.0` umbrella under the old scope is a separate lineage, unaffected.)
- **React Router consumers of `genesis-ui`:** inject your router's link + current path. `AppShell`/`StatCard` stay type-safe, but `ResourcePage` route-clicks fall back to a full-page reload until you wire `onNavigate`.
- **Next.js / no-router consumers:** the new defaults (`<a>` + History API) work out of the box — this is what unblocks a Next.js dashboard consuming `@marktiderman/genesis/*`.

### Concrete changes

**1. Scope rename** — `package.json` + imports:

```diff
- "genesis-ui": "^0.3.0"   # old pre-public scope
+ "@marktiderman/genesis-ui": "^2.0.0"
- "genesis-data-switchboard": "^0.3.0"   # old pre-public scope
+ "@marktiderman/genesis-switchboard": "^1.0.0"
```

**2. Router-agnostic `genesis-ui`** — new injectable-navigation contract (exported from the root + `/data`): `LinkComponent` / `GenesisLinkProps` (default `DefaultLink` = plain `<a>`), `NavigateFn` / `defaultNavigate`, `SearchParamsAdapter` / `useBrowserSearchParams`, `isPathActive`. Affected APIs: `AppShell` (+`linkComponent` / `activePath` / `isActive`), `StatCard` (+`linkComponent`), `ResourcePage` (+`onNavigate`), `useDataFilters` (+ optional `{ searchParams }`).

React Router consumers restore the previous behavior by injecting your router:

```tsx
import { Link, useLocation, useNavigate } from "react-router";
import { AppShell, ResourcePage, type LinkComponent } from "@marktiderman/genesis-ui/data";

const RouterLink: LinkComponent = ({ href, ...props }) => <Link to={href} {...props} />;

// Pass the full location so items whose `to` names a query or hash can be active:
const { pathname, search, hash } = useLocation();
<AppShell navItems={items} linkComponent={RouterLink} activePath={`${pathname}${search}${hash}`} />;

// ResourcePage row-click nav — wire onNavigate or it falls back to a full-page reload:
const navigate = useNavigate();
<ResourcePage detail="route" onNavigate={navigate} /* … */ />;
```

---

## v0.2.x → v0.3.0 — Theme system unified (PRD-07 Phase A2b)

🟡 **Action recommended for consumers wiring theme manually. Existing v1 path continues to work alongside until the final A2b commit (or G-PR-3b if visual parity is deferred).**

### What changed

The theme system collapses three mechanisms into one runtime model:

- CSS variables on web (Tailwind v4 `@theme` block, emitted by `tailwindFromBrand()`).
- NativeWind v5 token map on native (`themeFromBrand().css` for Metro + `variables.{light,dark}` for runtime mode switching).
- A single `<GenesisThemeProvider>` + `useTheme()` API exposed from `@marktiderman/genesis-design-system`. Identical TypeScript shape on both platforms.

A `GENESIS_THEME_V2` env-flag gates the new path during the dual-mode window so v0.2.x consumers stay unaffected. Set `GENESIS_THEME_V2=true` (or `VITE_GENESIS_THEME_V2=true` for Vite consumers) to opt in.

### Before (v0.2.x)

```tsx
// Web — relies on CSS vars in app.css; no provider exists
import "./app.css";
<GenesisProvider mock={...}>
  <App />
</GenesisProvider>;

// Native — different import path + brand-id string + separate hook name
import { GenesisThemeProvider } from "@marktiderman/genesis-design-system/providers/native";
<GenesisThemeProvider brand="genesis" mode="light">
  <App />
</GenesisThemeProvider>;

// const theme = useGenesisTheme();   ← native-only hook
```

### After (v0.3.0)

```tsx
// Same import + same shape on both platforms
import {
  GenesisThemeProvider,
  useTheme,
  type CanonicalBrand,
} from "@marktiderman/genesis-design-system";

const brand: CanonicalBrand = { /* full canonical brand object */ };

<GenesisThemeProvider brand={brand} mode="system">
  <App />
</GenesisThemeProvider>;

// Anywhere in the tree, same shape on web + native:
const { brand, mode, setMode, tokens } = useTheme();
```

### Migration steps

1. **Construct a `CanonicalBrand` object.** The unified provider takes a full brand object (not the v1 brand-id string). Use the OOTB Genesis brand inline, or import a consumer brand package (`@arcade/brand`, `@acme/brand`).
2. **Replace the v1 native import.** Swap `@marktiderman/genesis-design-system/providers/native` for the root `@marktiderman/genesis-design-system`. Remove `useGenesisTheme()` calls; replace with the unified `useTheme()`.
3. **Wire the factory output once at brand-package build time.** `tailwindFromBrand(brand).css` lands in your web `app/styles/tailwind.css`; `themeFromBrand(brand).css` lands in your native `apps/<app>/global.css`. The provider is the runtime layer; the factories are build-time.
4. **(During the dual-mode window) Beta-test behind `GENESIS_THEME_V2=true`.** Observe rendering against your existing v1 setup. Report regressions before the v1 path is removed.

### Concrete changes

- New exports from `@marktiderman/genesis-design-system`: `GenesisThemeProvider`, `useTheme`, `resolveTokens`, types `ResolvedTokens`/`UseThemeReturn`/`ThemeMode`, plus the `GENESIS_THEME_V2` flag readers.
- New subpath `./theme` (defaulted to web variant; Metro picks `./theme/index.native.js` via `react-native` export condition).
- v1 surfaces (`./providers/native` + `useGenesisTheme()`) remain available during the dual-mode window. They are scheduled for removal in the final A2b commit OR in a follow-up `G-PR-3b` PR after visual parity is confirmed in CI.
- TypeScript `jsx: "react-jsx"` enabled in `packages/design-system/tsconfig.json` to support the new `.tsx` provider files.

---

## v0.1.0 → v0.1.1 (PRD-07 Phase A1 — first canonical publish)

🟡 **Action recommended for prior consumers; pure additive otherwise.**

### What changed

This is the first publish from the canonical `marktiderman/genesis` repo. The packages at `@marktiderman/genesis-{core,design-system,ui,ui-native}` v0.1.0 were originally published from prior fork repos (`acme/acme-app` and `acme/acme` workspace forks — PRD-07 Phase A6 retires those forks). v0.1.1 swaps the published content to the canonical genesis-repo source.

### What this means for consumers

**If you currently install `@marktiderman/genesis-*@0.1.0`:**

- API surface is preserved. Public exports unchanged.
- Internal implementation may differ from the prior fork-published v0.1.0 (canonical genesis repo has had additional native-parity work that the forks didn't carry).
- Bump to `^0.1.1` to consume the canonical version.

**If you're installing fresh:**

- Install the latest. No migration needed.

### Concrete changes from prior fork-published v0.1.0

- `@marktiderman/genesis-ui-native` package description updated: `"(NativeWind v4)"` → `"(NativeWind v4-5)"` (matches the existing peerDeps range `^4.0.0 || ^5.0.0-preview`).
- NativeWind peer-dep range widened from `"^4.0.0 || ^5.0.0"` to `"^4.0.0 || ^5.0.0-preview"` so consumers on NativeWind 5 prereleases (e.g., an app on `5.0.0-preview.2`) can resolve. Stable `^5.0.0` continues to satisfy.
- Hook namespace convention locked at root `@marktiderman/genesis-core` (PRD-07 Phase A1.8). See `packages/core/src/hooks/index.ts` for the convention. **No existing hook signatures change.**

### Publishing infrastructure migrated to OIDC Trusted Publishing

Internal note (not consumer-facing): publishes now use [npm OIDC Trusted Publishing](https://docs.npmjs.com/trusted-publishers) instead of `NPM_TOKEN`. No long-lived secret; no 2FA bypass; provenance attestations native via `id-token: write` on the workflow. Consumers see no difference except that every published tarball has a verifiable Sigstore provenance attestation linking it back to the exact commit + workflow run.

---

## Visual regression (Phase D-VR)

🟡 **Action recommended for repo maintainers.** No consumer-facing API change.

PRD-07 Phase D-VR ships the visual regression infrastructure that catches silent rendering regressions in `@marktiderman/genesis-ui` (web) and `@marktiderman/genesis-ui-native` (mobile) before they reach downstream consumers. Two surfaces, two pipelines.

### Native — Maestro screenshot diff

> **2026-10-24:** `apps/sample-native` became the native starter (`apps/genesis-rn-starter`), and
> the component showcase screens and screenshot flows listed below were removed with it (they are
> in git history). The starter keeps one Maestro smoke flow; see
> `apps/genesis-rn-starter/.maestro/README.md`. The paths below are kept as the record.

- Flows: `apps/sample-native/.maestro/flows/screenshot-{light,dark,reduced-motion}.yaml`.
- Showcase screens: `apps/sample-native/app/components-showcase/*` (deep-link only).
- Workflow: `.github/workflows/visual-regression.yml` (iOS + Android).
- Diff tool: `scripts/diff-screenshots.mjs`.
- Coverage report: `pnpm visual:coverage` → `coverage/visual-coverage.json`.
- Baseline lives in `apps/sample-native/.maestro/screenshots/`. First run on `main` after this PR establishes the baseline; subsequent PRs diff against it.

See `apps/sample-native/.maestro/README.md` for local-run instructions.

### Web — visual regression (not currently covered)

- Storybook: `apps/sample/.storybook/{main.ts,preview.tsx}`.
- Stories: `apps/sample/stories/*.stories.tsx`.
- Workflow: **none.**

`.github/workflows/chromatic.yml` was deleted on 2026-08-03. It had been gated
behind `vars.CHROMATIC_ENABLED == 'true'`, which was never set, so it had never
run once — and activating it required a paid Chromatic account that was never
purchased. Rather than leave a workflow nobody could use and an activation
procedure nobody had followed, both were removed together.

**Known gap — and it is wider than web.** `visual-regression.yml` targets only
`apps/sample-native` and `packages/ui-native`, so web surfaces (`apps/sample`,
`packages/ui`, `packages/design-system`) have **no visual-regression workflow at
all**. But the native side is not actually covered either: as of 2026-08-03 that
workflow reports *"baseline empty (0 captures pending)"* and passes — it has
nothing to diff against until captures are committed to
`apps/sample-native/.maestro/screenshots/`. A green result there currently means
"nothing was compared", not "nothing changed".

So the honest position is: **neither web nor native has a working
visual-regression check today.** Storybook and the stories remain, so this is a matter of wiring up a
runner — Chromatic or otherwise — not of rebuilding the fixtures.

To restore Chromatic specifically: `git show <sha>:.github/workflows/chromatic.yml`
from before that date brings the workflow back, then create a Chromatic project
for `marktiderman/genesis`, add `CHROMATIC_PROJECT_TOKEN` as a repository secret
and `CHROMATIC_ENABLED=true` as a repository variable.

---

## Upcoming (planned per PRD-07)

### v0.1.x → v0.2.0 — brand-strip + canonical schema finalization (Phase A2)

🔴 **Action required for any consumer reading from the schema.**

Will document at release. Highlights:
- 4 brand presets removed from `@marktiderman/genesis-design-system` (`brand-acme` and three app-specific presets move to consumer brand packages). `brand-genesis` stays as OOTB fallback.
- `rank` token category dropped from canonical schema (move to consumer brand packages under the new `extensions` slot).
- New `extensions: Record<string, ColorScale>` slot on the canonical token schema for consumer-domain categories.
- Migration: consumers either depend on the new `@<consumer>/brand` packages (which fill the schema) OR fall back to `brand-genesis`.

### v0.x → v1.0 — stability gate

🟢 **No automatic action.**

v1.0 ships only when ALL of:
- 5 production consumer apps where `@marktiderman/genesis-*` is the primary DS (sample-native + sample do NOT count)
- NO workspace fork of `@marktiderman/genesis-*` exists in any consumer repo
- 0 open migration-critical bugs
- 90 consecutive days with all 4 conditions held

Per PRD-07 D3.4. Once v1.0 ships, breaking changes only at major; deprecation lifecycle stretches from "1 minor at 0.x" to "2 minor at 1.x+" per PRD-01 D16.

---

## Configuring Genesis (`genesis.config.yml`)

PRD-07 Phase D5.6 + D5.7. Genesis consumers may add one root-level config file at `genesis.config.yml` (repo root) — the single source of truth for which hooks fire, which CI checks block, and per-repo allowlists. It is optional (zero-config works); when present, it lives at the repo root and is the only place these knobs are read from. See `genesis.config.example.yml` for the canonical reference (every ACTIVE value shown = its default; keys marked reserved are not yet wired; the file is optional — zero-config works).

### Why one file

Before this consolidation, doctrine knobs lived in scattered `.skip-hooks.yml`, `lint-overrides.json`, ad-hoc env vars, and inline comments. SIMPLIFICATION #5: pull every Genesis knob into one place so `git diff genesis.config.yml` answers "what doctrine is this repo running?" in one shot.

### Schema versioning

The file MUST declare `schema_version: <int>` at the top. Validator (`scripts/validate-genesis-config.mjs`) refuses unknown versions. When the schema changes shape (rename a key, change an enum), bump the schema version in the same PR and document the migration here.

### Flag-creep guards (D5.7)

The validator enforces three guards to keep this file from drifting into a sprawling DSL:

1. **HARD MAX 40 keys (recursive count).** Adding a 41st key requires an RFC against `schema/genesis-config.schema.json`. The cap is intentional — every flag is a future migration.
2. **Schema-version field gates breaking changes.** Consumers must explicitly bump `schema_version` before genesis-lint accepts new shapes. Catches silent semantic drift.
3. **Warn-mode age check.** Any flag that's been in `mode: warn` for >90 days surfaces as a deprecation candidate. The intent of `warn` is "we're rolling this out; flip to `block` or remove within a quarter." Anything older than 90 days is dead code in disguise.

### How to add a new hook or CI check

1. Add the entry to `schema/genesis-config.schema.json` (shape).
2. Add the default to `genesis.config.example.yml` (consumer default).
3. Update this section + `hooks/README.md` (docs).
4. Run `node scripts/validate-genesis-config.mjs` to confirm under-40 keys.
5. If you tipped over 40, the validator FAILS — open an RFC before merging.

### Per-mode semantics

- `mode: block` — hard fail. PreToolUse hooks return exit 2; CI checks fail the workflow.
- `mode: ask` — only valid for `design-system-first`. Surfaces a confirmation prompt to the user; agent proceeds if the user OKs.
- `mode: warn` — emits a warning; does not block. Use for new checks during rollout.
- `mode: off` — disabled entirely. Use sparingly; prefer `warn` so you still see signal.

---

## How this file gets updated

Appended on every release in the same PR that bumps the version. Authored by the human/agent shipping the release. Format: a `## v<from> → v<to>` heading, status emoji, "What changed" section, "What this means for consumers" section, "Concrete changes" section.

Source of truth for *why* a change happened: the PR description + the relevant PRD-07 phase. This doc is the *what*.
