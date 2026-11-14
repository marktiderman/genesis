# @marktiderman/genesis-ui-native

## 3.12.1

### Patch Changes

- e7c1f1a: The `@hookform/resolvers` peer now accepts v7 (core and ui-native: `^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`; studio: `^5.1.0 || ^6.0.0 || ^7.0.0`), and `genesis studio init` installs `>=5.1.0 <8`, so an app already on 7 isn't asked to go back to 6. v7 changes two resolvers: the TypeBox resolver moves to `typebox` 1.x (the legacy `@sinclair/typebox` is no longer supported), and the `fluentvalidation-ts` resolver changes how it reports errors on array items. Genesis uses only the zod resolver, which ships byte-identical in 6.0.2 and 7.0.1, so Genesis's forms are unaffected, and the packages' tests now run on 7.0. `genesis init --template native` starts apps on `@hookform/resolvers` ^7.

## 3.12.0

### Minor Changes

- a6b65a9: Features: ui-twins, custom-views, record-pages, widgets
  A phone twin for every genesis-ui component that had none (ui-parity.json), with the web component's props and its behaviour from `@marktiderman/genesis-core/headless`:

  - Controls: `NativeButtonGroup`, `NativeInputGroup` and `NativePasswordToggleField` (on NativeInput's new `leading` and `trailing`), `NativeInputOTP` (one field under the boxes, so the system's code autofill works), `NativeCalendar` (single, multiple or range), `NativeCarousel`.
  - Data display: `NativeChartContainer` (bar, line and area; lines with react-native-svg passed as the new `GenesisModules.svg`), `NativeSortableList` (a drag handle, a long-press Move menu and screen-reader actions, announced), `NativeStatCard`, `NativeStatusBadge` (NativeBadge gains a tinted `danger` variant), `NativeUserAvatar`.
  - Pages, in `/layouts`: `DashboardPage`, `DetailPage`, `DocumentPage` and `FormPage`, on ScreenContainer. FormPage keeps its Save / Cancel bar above the keyboard through the app's keyboard-aware scroll view, or a KeyboardAvoidingView without one; `KeyboardScrollProvider` takes a new `sticky` view (`KeyboardStickyView`, read with `useKeyboardSticky`) to carry the bar.
  - Forms, in `/data`: `NativeFieldArrayRenderer`, `NativeFileUploadField` (the picker is the new `GenesisModules.filePicker`), `NativeRelationField` (NativeResourceView's link picker) and `NativeWizardForm`; NativeResourceFormFieldRenderer now draws array, file, image and relation fields with them.
  - Resource workspace: `NativeReadinessChip`, `NativeHeadlineNumbers`, `NativeSummaryCard`, `NativeFollowUpList`, `NativeResponsesToolbar`.
  - Records and settings: `NativeRecordPeek` (the record view in a sheet; Edit and Delete follow the screen's `can` and the view's update and delete guards, as the list's swipe actions do; Delete is confirmed once, in the list's words or the bin's, so `onDelete` is the write itself, and a rejected one is shown in plain words), `NativeCustomView` and `useNativeCustomView` (the list type), `NativeResourceSettingsPage`, `NativeSettingsRow` and `NativeToggleRow` (NativeListItem takes `accessibilityRole`, including `radio`, `accessibilityState` and `accessibilityLabel`).
  - `NativeNoFeaturesFound`, `NativeNoFeedbackFound` and `NativeNoSearchResults`, and `NativeWorkspaceSwitcher`.

  NativeNumberInput, NativeSlider, NativeStepper, NativeCombobox and NotificationsPage now take their clamping, snapping, step states, search and day groups from genesis-core. NativeCombobox's default search matches every word typed, in any order, ignoring accents ("cafe" finds "Café"), as the web's Combobox does. It returns more matches than the old substring search (every former match still matches): pass `filter` to keep the old rule. NativeNumberInput keeps what's being typed ("", "-", "1.") until the field is left, then shows its value again, as the web's NumberInput does. It passes a typed number on only while it is inside `min` and `max`, clamps one outside when the field is left or submitted, reads "1,234" as 1234, and takes `locale` to read a locale's own marks. NotificationsPage puts a later day under a first heading, Upcoming. NativeInputOTP tests `pattern` against the whole code, as the web's input-otp does: a change it refuses ("12a" in a digits field) keeps the code as it was. NativeInlineAlert's warning title is the foreground colour, which reads on the tint. NativeNumberInput rounds what's typed to `precision` when it commits, holds back "1,2" while it may still become "1,234", and commits on `onEndEditing` too; FormPage's action bar dismisses the keyboard before a button's press runs, so the focused field commits first.

  The twins take the web twins' props, and the older props still work: NativeChipGroup's `onChange` follows `mode` (`single` gives one string, `multiple` a list; with `mode` left out either, as before) and it takes `allowEmpty`, which clears the chosen chip when it is pressed again (without it, pressing the chosen chip calls `onChange` with its value, as before). Its `value` still takes a string or a list in either mode, unlike the web's ChipGroup, so existing `string | string[]` state keeps compiling; NativeChoiceCard takes a `value` inside a NativeRadioGroup, or `multiple` with `onSelectedChange(next)`, as the web's ChoiceCard (`selected` with `onPress` is deprecated); NotificationsPage takes `timeZone`.

## 3.11.0

### Minor Changes

- a5a8fdf: Custom views (ADR 0019): a screen an app draws itself over a view, while Genesis keeps the view's data and states.

  - genesis-ui (`/data`): `<CustomView view type="list|board|calendar">{(state) => …}</CustomView>` and `useCustomView` load the view's rows with its scope, preset, filters, URL state, live updates and permissions, and draw loading, empty (the view's `copy.empty` words) and error with a retry, each replaceable (`loading`, `empty`, `error`). The headless view query every view type shares is exported: `useViewListParams`, `useViewList` (paging, sort, search, selection, the open record, `urlState`, `can`), `useViewPermissions`, `useViewBoard` (columns from the board block, the move with its guards, refusal and conflict) and `useViewCalendarRange` (one window's rows, live). ResourceBoard and ResourceCalendar now load through `useViewBoard` and `useViewCalendarRange`, unchanged on screen. `useReducedMotion` (`/hooks`, `/data`).
  - genesis-core (`/resource-view`): `groupRows(view, rows, options)` groups rows by the view's `groupBy` on any platform.
  - genesis-design-system: `THEME_PARTS` gains `custom-view` (`data-view-type`, `data-state`), `custom-view-loading`, `custom-view-empty` and `custom-view-error`.
  - genesis-cli: doctor rules `app-part-name` (an app's own `data-slot` starts `app-` and doesn't clash with a Genesis part), `app-part-colors` (custom views and app parts take colours from roles only) and `custom-view-states` (a custom view doesn't draw its own loading, empty or error), all warn.

  View types and record pages (ADR 0021):

  - genesis-ui (`/data`): a view-type registry (`defineViewType`, `registerViewType`, `resolveViewType`, `listViewTypes`); `<ResourceView type>` is the preferred prop (`mode` stays as its alias) and dispatches through it, with `gallery` now its own type. `open` (`side-peek`, `center-peek`, `page`) and `recordView` on ResourceView; ResourcePage's `detail` takes the same words beside `panel`, `modal` and `route` (`detailMode`, `recordOpen`). The board and the calendar honour the open mode (`open`, `recordView`, `onNavigate`). A peek draws the view's record view when it names one: `RecordPeek`, and `RecordView presentation="peek"` (sections as tabs that switch in place; `section` and `sectionHref` are optional there). RecordView draws the document template.
  - genesis-core (`/resource-view`): `defineView`'s `open` (`RecordOpen`, `RECORD_OPEN_MODES`) and `recordView`; `defineRecordView`'s `template` (`standard`, `document`) and `document` (`cover`, `icon`, `properties`, `body`). A field's form-control hint is `control` (`ControlHint`, `fieldControl`); `widget` and `WidgetHint` stay as deprecated aliases every reader still reads.
  - genesis-ui-native: `NativeResourceView` takes `type` (`list`, `grid`, `gallery`), `mode` its alias; `NativeResourceViewType`.
  - genesis-studio, genesis-studio-server and `genesis introspect` read `control` beside `widget`.
  - genesis-design-system: parts `board`, `board-column`, `board-card`, `calendar`, `calendar-event`, `gallery`, `record-page`, `record-peek` and the document template's `record-page-cover`, `-icon`, `-title`, `-properties` and `-body`.
  - genesis-cli: the ui doctor rule `lists-use-resource-view` accepts a file that defines or registers a view type, and a KanbanBoard fed by `useViewBoard`.

## 3.10.0

### Minor Changes

- 273e1fa: `NativeImage` takes a `cacheKey`: with expo-image it caches the picture under that key instead of its URL (`source={{ uri, cacheKey }}`), so a signed URL that rotates (a new expiry or signature for the same file) still hits the memory and disk cache instead of downloading the picture again. `recyclingKey` now defaults to `cacheKey`, then `src`, so a rotated URL for the same picture doesn't reset the view. React Native's `Image` fallback ignores it, as it does `placeholder` and `priority`. `GalleryItem` gains an optional `cacheKey`, which `NativeGalleryGrid` and `NativeLightbox` pass to their images; the web grid ignores it. `GenesisImageProps.source` accepts `{ uri, cacheKey }`.

## 3.9.1

### Patch Changes

- 4261fb1: `primary-text` follow-ups.

  - **design-system:** in light mode, `--primary-text` now also reaches 4.5:1 on the muted fill (message bubbles, muted rows), as muted text does. A gold `#FFC402` on white now gives `#8a6a00` (5.07:1 on white, 4.6:1 on the muted fill). `primaryText` and `dark.primaryText` must be `#rgb` / `#rrggbb` (schema and `validateBrand`), and a brand's own `primaryText` now wins over a design system's accent text in `themeFromBrand`. `generateLightTheme` / `generateDarkTheme` pick a readable `--primary-text` instead of copying the primary. The DTCG themes (and `nativeThemeLight` / `nativeThemeDark`) gain `primary-text`.
  - **ui:** `brandThemeStyle(brand, { mode: "dark" })` and `workspaceThemeStyle(workspace, { mode: "dark" })` lighten `--primary-text` until it reads on the dark background, for a root that renders dark (an inline style can't follow `.dark`). EmptyState's action link underlines on hover instead of fading below 4.5:1.
  - **ui-native:** the TabBar "More" sheet's active row uses `text-accent-foreground` on its accent fill.

  If you override `--primary` on a nested element (a scoped theme), set `--primary-text` beside it: the `:root` fallback `var(--primary)` is resolved at the root.

- 6996d4a: A new theme role, `primary-text`: the primary as text or an icon on the page, readable for every brand.

  `primary` is a fill colour, and a light brand primary (a gold `#FFC402` on white is 1.6:1) made every link, active tab, stat and icon coloured with `text-primary` unreadable. `--primary-text` (the `text-primary-text` class on web and in the NativeWind preset) is now declared in both modes for every brand: the primary where it reads at 4.5:1 on that mode's background, otherwise the primary's hue darkened (light mode) or lightened (dark mode) until it does. The gold above becomes `#947100` (4.54:1) on white. Genesis's own indigo already reads, so nothing changes for the default theme.

  - **design-system:** `brandRoleVariables`, `themeFromBrand`, the NativeWind preset, `themes/genesis.css`, the Tailwind v4 bridge and the design-system colour engine all emit `--primary-text`. A brand can pick the exact shade with the new optional `primaryText` and `dark.primaryText` fields. `brandContrastProblems` checks primary text on the page at 4.5:1.
  - **ui, ui-native, chat, forms, sites, support:** components that coloured text or icons with `text-primary` now use `text-primary-text`. Fills (`bg-primary`), borders and rings are unchanged. `brandThemeStyle` and the sites theme set `--primary-text` too.

  `themes/genesis.css` declares `--primary-text: var(--primary)`, so an app that sets only `--primary` in its own CSS looks exactly as before. If that primary is light, set `--primary-text` beside it (or take the role variables from `brandRoleVariables` / `themeFromBrand`) and drop any app-side "readable primary" token. Use `text-primary-text` in your own screens wherever you colour text with the primary.

## 3.9.0

### Minor Changes

- fcf81d4: Opt-in brand roles, backward compatible: `CanonicalBrand` gains optional `dark` (dark-mode roles that `brandRoleVariables`, `resolveTokens` and sites themes resolve from), `signal`, `accents` (`--brand-accent-<name>`, `theme.accents`), `gradients.primary` (`--brand-gradient-primary`, `theme.buttonGradient`) and `typography.display` (`--font-display`, `--font-weight-display`, `--font-numeric-display`, `theme.display`). New `brandExtraVariables`, `brandGradientCss` and `useOptionalTheme`. `Button` / `NativeButton` gain `variant="gradient"` (falls back to the primary), and new `TierBadge` / `NativeTierBadge` take a tone from `accents`. A brand that sets none of these renders exactly as before.
- b53d341: genesis-chat's web `ChatThread` and `ChatInbox` now sit on genesis-ui's `ThreadPage` and `InboxPage`, with chat's rows and composer in their slots. Their props are unchanged.

  - `ThreadMessage` takes an optional `jumpId`: the id `jumpTo` names a message by, when that isn't its `id`. Both `ThreadPage`s honour it, and web `ThreadList` takes `jumpId`, as `NativeThreadList` already does.
  - Web `InboxPage`: Home and End go to the first and last rows. Web `ThreadList` no longer chains its scroll to the page around it.
  - What a chat reader sees change on the web: the pill says "Jump to latest" whenever they've scrolled up, instead of "New messages" only when one arrived. A message of yours from another device no longer pulls them to the bottom; what they send here still does. A jump that can't load says the load failed, not that the message is gone. Inbox rows have dividers, and are one tab stop that moves with the arrow keys, instead of one stop each. `ChatInbox` shows cached rows when a refresh fails, instead of the error. A screen reader hears "Loading" while a thread's first page loads, instead of "Loading messages".
  - Test ids: `genesis-chat-scroller` is `genesis-chat-thread-page-messages`, `genesis-chat-announcer` is `genesis-chat-thread-page-messages-announcer`, `genesis-chat-new-pill` is `genesis-chat-thread-page-jump-latest`, and `genesis-chat-thread-loading` is `genesis-chat-thread-page-messages-loading`.

  Chat now needs genesis-core 2.13.0 and genesis-ui 2.32.0.

- cff9c4c: `NativeComposerBar`'s `empty` is now `hasContent`, with the opposite sense: pass `hasContent` when attachments are waiting and no text is needed (it was `empty={false}`). No alias: `empty` shipped one release ago and nothing uses it. `genesis upgrade` rewrites it (the `genesis-ui-native-3-8-composer-has-content` codemod); by hand, `empty={false}` becomes `hasContent` and `empty` becomes `hasContent={false}`. The bar's other props from that release now have tests.

  genesis-chat's native `ChatComposer` now sits on `NativeComposerBar`, with the same props and test ids, so it takes the bar's sizes (a 44pt input) and press feedback. Its schedule action on Send is named `schedule` instead of `longpress`, with a new `scheduleHoldHint` in the copy. An app that gave haptics to both Genesis and chat gets one tap on send. Chat now needs genesis-ui-native 3.8.0.

- 3d601c8: What building a support inbox on the layouts asked for. Nothing changes for an app that doesn't use these.

  - `InboxLayout`: below `lg`, a button over the list opens `views` in a sheet (`activeViewLabel` names the chosen one). `thread` can be a function that gets `{ contextToggle }` to place the Details toggle in its own header, and then no row is spent on it from `md` up. A `thread` element keeps the row as before.
  - `ThreadAttachment` takes `kind` (`image`, the default, or `file`) and `name`. A file shows its name and opens `uri`: on the web, http(s) with its host beside the name, or a `blob:` as a download; on the phone, http(s), and a local file only on your own message.
  - `ThreadPage`, web and native: `error`, `errorTitle`, `errorBody`, `onRetry` and `retryLabel`. The `empty` slot gets `actionLabel` and `onAction`.
  - `ThreadComposer` carries `modesLabel`, and `NativeComposerBar` takes it too, as `ComposerBar` does.
  - The web layouts' docs and genesis-ui's README say what Tailwind needs to see the package's classes.

- 76294ce: `NativeButton` answers a touch through `usePressFeedback`, like every Genesis pressable: what's inside it shrinks a little while held, or dims under Reduce Motion, and the background stays still. Its `haptic` prop and each size's gap are unchanged. What's inside now sits a level down, so layout classes in `className` (`justify-*`, `items-*`, `gap-*`, `flex-row`, `flex-col`) are applied there too; other classes stay on the button.

  `sentBubbleColor(roles)` (genesis-ui-native/hooks) names the colour of a message you sent, in one place, for `ThreadPage` and genesis-chat's bubble. It's still `tint`, so nothing changes on screen.

  genesis-chat's native haptics play through `playHaptic`, and `ChatNativeProvider` uses the module the app gave Genesis when it gave chat none, so it's passed once. What plays at each moment is unchanged.

- f342c0d: `NativeSwipeRow`: a row's actions behind a swipe, on the app's `GenesisModules.swipeable` (`ReanimatedSwipeable`); without the module, just the row. `InboxSwipeAction` takes `side` (`leading` or `trailing`, the default). `InboxPage`'s `swipeable` slot defaults to it.

  `NativeContextMenu`: what a long press opens, a sheet of actions with Cancel. An action runs once, after the sheet has gone. `InboxPage` (one menu for the page, `<testID>-menu`) and `NativeComposerBar`'s `sendActions` open it instead of the system alert. `NativeSheet` takes `onDismissed`. `NativeResourceView` still uses `showInboxActions`.

- 3a5703c: A sort can say where empty values go: `nulls: "first" | "last"` on `SortParam`, a view's `orderBy`, a link's `orderBy` and each of `slotProps.filters.sortOptions`. The Supabase provider passes it to both offset and cursor paging, and a cursor made for another placement is refused. Unset, nothing changes.

  `useResource`'s `update` now fails when the provider returns no row (`DataWriteError` with outcome `forbidden`), in every mutation mode, before the write counts as committed. The Supabase provider already threw; this reaches a custom provider that returned `{ data: null }`. ResourceView's board no longer checks this itself.

  A failed board move is no longer logged to the console as well as shown on the board, and a conflict the board's sheet shows no longer reaches the screen's `resourceOptions.onError`.

  `usePersistedUiState`'s follow-ups: `createLocalStorageAdapter` warns once per key and operation rather than on every render, DataTable's column move writes to the current key when `columnOrderKey` changes, and AppShell's Reset clears its stored options.

- 70d4ff4: New `NativeChoiceCard`: one selectable option as a card (a radio, or a checkbox with `multiple`; a `media` slot for a thumbnail or icon; title and description; `invalid` for an unanswered question), read as one radio or checkbox by VoiceOver and TalkBack. `NativeInlineAlert` and `NativeBanner` take `children` (content under the description) and `actions` (a row of buttons). `NativeProgress` takes `indicatorColor` and `trackColor` as colour values, for a screen or package that styles without NativeWind. `NativeRating` matches the web `Rating`: `size="touch"` (a 44pt target per star), `tone="primary"` (the brand's tint), `clearable={false}` and `disabled`.
- 4ed8ce4: New `NativeTabBar` (on NativeTabs; past five tabs the fifth slot is "More", a NativeSheet with the rest; it splits with genesis-core's `splitTabBarItems` and names a badged tab with its count), `NativeBulkBar` (the twin of the web `DataBulkBar`), `NativeShareSheet` (the twin of `ShareDialog`: link, Copy through `onCopy`, the system share sheet with the link sent once per platform, and the host's `renderQr`; no new dependency) and `NativeWhatsNewSheet` (the one "what's new" sheet genesis-native and genesis-product now render). `NativeTabsTrigger` takes `accessibilityLabel`.

### Patch Changes

- 200b7fd: `NativeButton` keeps a caller's `accessibilityState.busy` when `loading` is not set, so a screen reader hears "busy". The form's Button and answer field drop the primitives' fixed height and boxed-field classes, so they grow with the text size and keep the answer line; a long answer no longer takes `NativeTextarea`'s default four lines.

  `NativeProgress` takes `style` and `indicatorStyle`, for colors from a theme object. The form's progress bar uses them, so it keeps the form theme's `tint` on `fill`, and the inner bar is hidden from screen readers, so they hear one progress bar. The form's text parts set their own line height so the ending check, the progress label and the required mark draw at their size.

  `NativeButton` types `style` and `ref`, and `NativeText`, `NativeInput` and `NativeTextarea` type `ref` (React 19 passes it as a prop), so a caller passes them without a cast.

- 34fb7ab: NativeGalleryGrid draws on the first paint (at the window width, corrected by `onLayout`) and sets `contentInsetAdjustmentBehavior="automatic"` (a new prop), so under an iOS large-title header the first row starts below the title instead of under it.
- 29554ef: Jumping to a row in a thread, settled.

  - `useThreadJump` returns `cancel()`, which drops a jump the reader has taken over from.
  - `NativeThreadList`: the reader's touch wins. A drag during a jump cancels the tries still queued (also the second try at the newest row) and a jump still loading, so nothing snaps back.
  - `ThreadList` (web): a wheel, a touch, the scroll keys or the scrollbar drop a jump still loading. A row landing no longer takes focus from a field the reader is typing in. A jump that fails leaves the reader where they are; `NativeThreadList` still goes back to the newest, because FlatList may not have been placed yet.
  - `ThreadPage` (web): with `onJumpFailed`, the app says what happened, as on native. Without it, a screen reader hears `labels.messageGone`.
  - `NativeThreadList` and `ThreadList`: following new rows comes back on after a jump that moved nothing (a short thread).
  - A row is gone when, once `onLoadUntil` has settled or failed, no row answers to its id. What's drawn counts, not what a cache holds: a jump to a message another view has cached, but this thread doesn't draw, loads and then says it's gone. A deleted message's tombstone is a row, so it's found.
  - genesis-chat, web and native: a load that failed says so, and no longer also says the message is gone. A jump whose first page failed waits: it says the read failed and goes ahead when the rows come.
  - For the record, from the release that added `jumpId`: `<testID>-earlier-loading` on chat's list became `<testID>-list-earlier-loading`.

## 3.8.0

### Minor Changes

- 2ccdd11: NativeIcon gains ten semantic names (undo, redo, grid, table, list, sort, upload, eye, grip, link), matching the icons added to the Figma library; the NativeIcon Code Connect template now translates the library's lucide icon names to semantic names.

## 3.7.0

### Minor Changes

- ab4c52d: Haptics and press feedback. `GenesisModules.haptics` takes `expo-haptics` (`import * as`), and `useHaptics()` plays a named haptic through it (`light`, `medium`, `heavy`, `select`, `success`, `warning`, `error`; `playHaptic(module, kind)` outside React): it never throws or rejects, and without the module it does nothing. `usePressFeedback({ haptic })` gives a pressable of your own the shared feel: it shrinks while held on the motion tokens' `press` duration and springs back on `snappy`, or dims under Reduce Motion, with `select` ticking on press-in and other haptics playing on `confirm()` from `onPress`. `NativeButton` takes an optional `haptic` (`select` ticks on press-in, as in `usePressFeedback`), and `NativeComposerBar`'s send button now presses in and taps `light` when a message sends (with the module given). A new doctor rule, `haptics-use-genesis`, warns on new code (not tests) that calls expo-haptics' `impactAsync`, `selectionAsync` or `notificationAsync` directly.

  Features: motion-kit

- 01549d8: NativeComposerBar takes `sendActions`, `idleAction`, `replaceInput`, `onSelectionChange`, `editable` and `empty`, so a chat composer can sit on it.
- 1148741: NativeThreadList: `jumpId`, the id `jumpTo` names a row by when that isn't the row's key. A message keyed by the id the phone gave it (so it keeps its row when the server's copy lands) can now be gone to by the server's id; return `null` for a row that can't be gone to. `keyExtractor` stays the default.

  Fixed: on FlatList (no FlashList module), going to a row scrolled straight back to the bottom. The jump's own scroll starts at the bottom, so its first scroll events read as "at the bottom", which turned following back on. The list now ignores its own scroll events until it settles, each try at the row restarts that, the check for "landed at the bottom" waits until then, and a reader who takes hold of the list (a drag) ends that at once, so their scrolling counts.

## 3.6.0

### Minor Changes

- 9765abf: A save that meets someone else's change now asks the person instead of only showing an error: their value beside yours, then "Keep mine" or "Take theirs". Features: data-offline.

  - **genesis-core:**
    - `writeConflict(error, mine, { changed?, view? })` turns a `conflict` `DataWriteError` into a `WriteConflict`: `theirs`, `mine`, the `fields` this person changed that differ from theirs (a field their row doesn't carry counts as different), and `currentVersion`. Empty values, numbers and their text, dates and object key order compare as a person would.
    - `WriteState` (`pending`, `sending`, `paused`, `failed`, `conflict`) is the one shape for where a write stands.
    - `useResourceForm` returns `conflict`, `keepMine()`, `takeTheirs()` and `dismissConflict()`. What the person typed stays on the form until they save or take theirs, across an optimistic save's refetch too. Keep mine sends this person's changes at the version the conflict reported, with their values for every other field, and rejects with the reason if it fails for anything but a new conflict. After take theirs, the next save is checked against their version.
    - `ExecuteWriteArgs.expectedVersion` names the version a write is checked against.
  - **genesis-ui:** `ConflictSheet`, from `/data`. `ResourceForm` (every layout, and after an optimistic save closed it, without a second toast) and `RecordView`'s settings sections open it on a conflict. It hides keep mine when there's no version to save at. New `conflict` messages.
  - **genesis-ui-native:** `NativeConflictSheet`, from `/data`, announced as it opens. `NativeResourceForm` and `NativeRecordView`'s settings sections open it on a conflict; its words come from `messages.conflict`.
  - **genesis-studio:** the record panel's edit conflict opens `ConflictSheet` (theirs beside yours) instead of replacing what was typed. Its genesis-core floor is now 2.11: upgrade genesis-core with genesis-studio.

- 00ac05c: `GalleryGrid` and `NativeGalleryGrid` take ResourceView's names: `loadMore` (was `onNearEnd`) and `groupBy` (was `getGroup`). The old names still work and are deprecated.

  An item with no image (`src: ""`) draws a neutral 4:3 tile showing its `alt` and `caption`, instead of an empty picture. It stays clickable and selectable, and its accessible name is unchanged. ResourceView's gallery grid uses this for records without an image.

- dcf2b4f: The gallery primitives on the phone, with the web's props and defaults:

  - **`NativeGalleryGrid`:** `onItemPress`, as `NativeResourcePage` pairs with the web's `onItemClick`. The rows are a virtualized list with `header` and `footer`, and `onNearEnd` fires as scrolling nears the end.
  - **`NativeLightbox`:** the one photo viewer.
    - Pinch or double-tap to zoom; paging is off while zoomed.
    - Pull down to close, with the backdrop fading.
    - Tap to show or hide the top bar and caption.
    - An adjustable pager for VoiceOver and TalkBack.
    - `renderMedia` for videos, and `labels`.
    - The gestures are built from genesis-chat's photo viewer (`NativeZoomablePhoto` and the `lightbox*` helpers). genesis-chat still has its own viewer for now; it moves onto this one in a follow-up, which removes chat's copy.
  - **`NativeGalleryCard`, `NativeLiveIndicator`, `NativeRating`.**
  - **Icon names:** clapperboard, folder-plus, maximize, settings-2, aperture, radio and star.

  Features: media-gallery, rating

- dc3b617: Motion tokens, defined once for web and native. genesis-design-system adds `resolveMotion(level, { reducedMotion })` with the shared durations, easings and springs (also at `@marktiderman/genesis-design-system/tokens/motion`), and its design systems now emit their `--ds-dur-*` and `--ds-ease-*` variables from it (the same values, plus `--ds-dur-fast`, `--ds-dur-base` and `--ds-ease-decelerate`). genesis-ui-native adds `useMotion({ level })` and `animateMotion()` (JS thread; under Reduce Motion it returns the final value), plus the worklet-safe `motionSpring()` and `motionTiming(motion, duration, Easing)`, which build Reanimated configs (under Reduce Motion, zero durations and stiff, critically damped springs); Drawer, Toast and Skeleton read their durations from them, unchanged. A new doctor rule, `motion-uses-tokens`, warns on new code that writes a non-zero duration or spring as a number literal in an animation config (Reanimated, React Native `Animated`, and Reanimated layout animations).

  Features: motion-kit

- 00ac05c: Gallery mode for lists. A view's `gallery` block (`defineView`: `image`, `width`, `height`, `caption`, `alt`, `rowHeight`) makes `mode="grid"` a photo per row in justified rows, in place of cards: ResourceView draws it with GalleryGrid, NativeResourceView with NativeGalleryGrid, and both pack the rows with genesis-core's `justifyRows`. A screen's `gallery` prop overrides the block or adds one. Pressing a photo opens the row as a card does; paging, search, the peek and the table and list views are unchanged, and a screen's own `slots.grid` still wins. `view.galleryItem(row)` gives the row as a `GalleryItem` (an empty `src` when it has no image, drawn as a placeholder), and `galleryProblems` checks a block. A ResourcePage grid slot can opt in to its open handler with a static `opensItems = true`, as the gallery does; other grid slots get exactly what they did before.
- e8b47fb: ThreadPage is rebuilt on two new atoms that apps can also use on their own.

  **`NativeThreadList`** is a bottom-anchored conversation list:
  - oldest first, not inverted;
  - holds its place while earlier messages load, both by themselves near the top and with the "Load earlier" button;
  - follows the newest message only while you're at the bottom;
  - goes to a message (`jumpTo`, with `onLoadUntil`) and announces it;
  - uses FlashList v2's chat mode when the app passed `list`, else FlatList.

  **`NativeComposerBar`** is the composer:
  - grows as you type, up to `maxLines`;
  - has a 44pt send button, which shows its label when no icon set is available;
  - takes `modes` with a tone, where `internal` tints the bar;
  - has `leading`, `trailing` and `above` slots.

  ThreadPage adds:
  - event rows (`kind: "event"`);
  - `loading` (a skeleton), `updating` (an "Updating…" line), `firstUnreadId`, and `jumpTo` with `onLoadUntil` (through the new `useThreadJump`, promoted from chat's jump: it waits for the first page, highlights the message, and says when one can't be found);
  - the send states `pending`, `paused` and `conflict`, with `onDiscard`;
  - message `tone` (`MessageTone`; an internal note says so to VoiceOver), composer `modes`, `sendingLabel`, `above` and `trailing`, and a "Jump to latest" pill;
  - the slots `event`, `unreadDivider` and `headerRegion`.

  `GenesisModules` takes `keyboardAvoidingView` (react-native-keyboard-controller's), which ThreadPage uses with `automaticOffset`, so the composer follows the keyboard frame by frame wherever the page sits. The starter passes it. The optional peer react-native-keyboard-controller is now `>=1.21.0` (for `automaticOffset`).

  **Upgrading an existing ThreadPage screen:** if your app sets up react-native-keyboard-controller (the native shell's `keyboardProvider` and `keyboardScroll`), also pass its `KeyboardAvoidingView` as `keyboardAvoidingView` in your Genesis modules, as the starter does (`apps/genesis-rn-starter/src/lib/native-modules.ts`). Without it the composer falls back to React Native's `KeyboardAvoidingView`, and a development warning says so. genesis-chat's `ChatThreadScreen` uses the same module when chat's own `keyboardAvoidingView` isn't passed, so you pass it once.

  **Behaviour changes for existing ThreadPage screens:**
  - ThreadPage no longer uses the app's `KeyboardScrollProvider` (a virtualized list can't sit inside a scroll view). It sits in the keyboard module (with `automaticOffset`; `keyboardVerticalOffset` is extra space there), or React Native's `KeyboardAvoidingView` (`keyboardVerticalOffset` defaults to 100 on iOS, as before; on Android its `behavior` is now `height`, so the composer clears the keyboard under edge-to-edge), under the testID `<testID>-keyboard`. The `-scroll` and `-kav` testIDs are gone.
  - A new message scrolls into view only when you're at the bottom; up the thread, a "Jump to latest" pill shows instead (it used to always scroll to the newest).
  - `header` now renders above the "Load earlier" button, in the list.
  - `ThreadMessage.status` takes three more values (`pending`, `paused`, `conflict`): a custom `slots.message` with an exhaustive `switch` on it needs the new cases.
  - The composer's input stays editable while a message sends (the keyboard stays up); a second send is still blocked.
  - Earlier pages also load by themselves near the top, so `onLoadEarlier` can fire without a tap.
  - With FlashList, rows are recycled, so state inside a custom `slots.message` component must be keyed by the message.
  - The default send button is now a 44pt round button (it was a small "Send" button).
  - Read receipts skip messages that are pending, paused or in conflict.
  - Discard is offered for a pending, paused, failed or conflicted message, not one that's sending.
  - Dragging the list dismisses the keyboard interactively on iOS and on drag on Android.
  - `jumpTo={null}` cancels a jump in progress.

  genesis-chat's own `threadListMode`, `nearBottom`, `AT_BOTTOM_POINTS` and `useJumpToMessage` are deprecated in favour of these; ChatThreadScreen moves onto NativeThreadList next, and the copies go then.

  A new doctor rule, `threads-use-thread-list` (warn, native, newOnly), flags a hand-built inverted or bottom-started FlatList/FlashList in a screen that doesn't render ThreadPage, NativeThreadList or ChatThreadScreen.

  Features: inbox-thread

### Patch Changes

- 00ac05c: The justified gallery layout has one home: `@marktiderman/genesis-core/gallery` exports `GalleryItem`, `GALLERY_DEFAULTS`, `GalleryTileAspect`, `justifyRows`, `galleryItemRatio`, `DEFAULT_GALLERY_RATIO` and the `JustifiedRow`/`JustifiedTile` types. genesis-ui and genesis-ui-native re-export them under the same names, so existing imports keep working, and the native copy (with the test that kept it in step) is gone.
- 00ac05c: A placeholder tile (an item with no image) in a gallery that isn't clickable or selectable is named for screen readers as an image, by its `alt`, then its `caption`.
- e36e6d8: `NativeLightbox` and `NativeGalleryGrid` follow-ups:

  - With `renderMedia`, the pages are no longer one VoiceOver element, so controls inside them (a video player's) can be reached. The counter in the top bar is the adjustable pager instead.
  - `zoomable={false}` turns zoom off while pull-down-to-close stays on. `NativeZoomablePhoto` takes `zoomable`.
  - When a parent doesn't take the page a swipe asks for, the pager scrolls back to `index`.
  - `NativeGalleryGrid`'s docs say not to nest it in a ScrollView; put content in `header` and `footer` instead.

- 00ac05c: `Lightbox` and `NativeLightbox` show no "1 / 1" counter for a single picture.
- 3784e9e: Motion tokens, following triage's review.
  - Drawer, Toast and Skeleton read their durations and Reduce Motion through `useMotion`, the same path every other motion takes.
  - Toast's entrance uses the `decelerate` easing token (the same cubic ease-out curve as before).
  - The `motion-uses-tokens` doctor rule checks every file: mentioning a motion helper no longer exempts a file. Its pattern is held to test fixtures.

  The public `GenesisReanimatedModule` type (what an app passes as `GenesisModules.reanimated`) gains two optional members, `withSpring` and `Easing.bezier`. Both are optional, so an app passing an older module, or a test fake, still type-checks.

- 00ac05c: `RecordView`'s and `NativeRecordView`'s settings sections save through the resource's write path (`useResource`'s `update` with `{ expectedVersion }`) rather than calling the provider directly. The version a save starts from is unchanged: the row the edit started on, and after a save, the version that save left. What changes is that the version a save commits now goes into every cached copy of the row, and a save sent while another of the same record is in flight is checked against the version that one commits. So a board move or list edit of the record right after a settings save is no longer refused as a conflict with that save.

  Features: data-offline

- eb441f9: Versioned writes: two people editing the same record no longer silently overwrite each other. The second save, made on the copy read before the first, comes back as a `conflict`. Features: data-offline.

  - **genesis-core, Supabase provider:** a resource's `version: { field, kind: "integer" | "timestamp" }` rule checks every update and delete against `expectedVersion` (`where id = … and version = …`).
    - When no row matches, the row is read back. At another version it's `conflict`, with `error.current` and `error.currentVersion`; at the same version it's `forbidden`; when it isn't visible it's `gone`.
    - The submitted version is never written.
    - `capabilities(resource)` reports `versionedWrites: true` and the new `version` (`VersionField`).
    - An `update` override gets `{ expectedVersion }` as a third argument when a version is checked; overrides called without one are unchanged.
    - Recycle-bin tables check the version before the delete.
  - **genesis-core, hooks:**
    - `useResource` and `useResourceForm` send the version of the row the change was made on, through `SendContext.expectedVersion`: an edit form's opened record (`ExecuteWriteArgs.base`), else the row cached when the write was made. A write made behind another on the same record is checked against the version that one committed at.
    - After a save they put the new version into every cached copy, so a second edit is checked against it.
    - A resource without the rule, a row that wasn't read first, or a provider without capabilities is sent unchecked, as before. A versioned resource whose rows don't carry the version column is reported once through `reportError`.
    - A timestamp version is compared as an instant (to the microsecond), and a conflict's `error.current` is read through the resource's `source` and `select`.
  - **genesis-ui, genesis-ui-native:** `RecordView`'s settings sections send the version of the row as it was when the person started editing.
  - **genesis-supabase:** migration `0019_genesis_version_bump.sql` (with a pgTAP test), the `versioned-writes` block and `versionedWritesBlock`. `genesis_version_bump('col')` advances the column by one on every update, whatever the update wrote, and refuses a column that isn't an integer.

- 00ac05c: Web messaging, review follow-ups.

  - **genesis-ui:**
    - `ThreadPage` and `InboxPage` show times once hydrated, in the viewer's time zone, so server-rendered HTML matches.
    - The thread's log is a tab stop, so keyboard users can scroll it. "Jump to latest" moves focus to the log before it goes away.
    - Rows don't re-render on each keystroke in the composer.
    - `InboxPage.onEndReached` asks once per page, and the new `hasMore={false}` stops it.
    - The README lists the props that are web only.
  - **genesis-ui-native:** `InboxPage` marks a `selected` row (filled, and `selected` to a screen reader), as the web does.
  - **genesis-chat and genesis-support:** the docs of chat's web thread, inbox and composer, and of support's web-chat threads, name their move onto genesis-ui's components (feature `inbox-thread`). No behaviour change.

  Features: inbox-thread

- 00ac05c: Messaging layouts for the web, on one conversation contract shared with native.

  - **genesis-core:** a new `@marktiderman/genesis-core/conversation` subpath with the contract the messaging layouts share:
    - `ThreadMessage`, `ThreadMessageStatus`, `MessageTone`, `ThreadAttachment`;
    - `ThreadComposer`, `ComposerMode`, `ComposerTone`;
    - `ThreadLabels` and `DEFAULT_THREAD_LABELS`;
    - `InboxItem` (with a new optional `selected`) and `InboxSwipeAction`;
    - `readReceiptFor`, `formatInboxTime`, `formatMessageTime` and `isDelivered`;
    - `useThreadJump`, moved here from genesis-ui-native.
  - **genesis-ui:** `ThreadPage`, `ThreadList`, `ComposerBar`, `InboxPage` and `InboxLayout` (three panes: views, list, thread, context).
    - **`ThreadPage`:** `conversationId` (a new conversation opens afresh). It announces only someone else's new message, and stays at the bottom as content resizes.
    - **`InboxViews`:** the views rail.
    - **`InboxPage`:** controlled `selectedId` and `onSelect`.
    - **`InboxLayout`:** a context sidebar that toggles, can remember its state, and becomes a sheet below `xl`, plus optional keyboard `shortcuts` that stay off while typing. They take the same props and slots as genesis-ui-native's, so one description renders on web and phone. The composer sends on Enter, or on Cmd/Ctrl+Enter with `sendOn="mod-enter"`. Inbox rows move with the arrow keys or j/k, and a row's actions become a "More" menu.
  - **genesis-ui-native:** its ThreadPage and InboxPage types, `readReceiptFor`, `formatInboxTime` and `useThreadJump` now come from genesis-core and are re-exported unchanged.

  Features: inbox-thread

## 3.5.1

### Patch Changes

- 6c76b5e: ResourceView gaps a consumer app found while adopting it. Every new behaviour is opt-in.

  - **ResourceForm from a view.** `<ResourceForm view={tasksView} …>` opens the form ResourceView would, with no list around it: the same fields (one builder, `useViewFormFields`, now exported from `/data`), links as pickers, the viewer's scope and a single-value `filter` filled hidden on create, and the view's noun and `copy.form` words. `filter`, `defaults` and `scoped` work as on ResourceView; `fields`, `title`, `submitLabel`, `description` and `noun` still win. `resource` is optional when a view is given. A view's fields are the whole form even when empty (core's `useResourceForm` takes `inferFields: false` for that), and a value the `filter` fixes is never replaced from the URL (`ResourceFormFieldDef.fromUrl: false`, which ResourceView's own form now sets too).
  - **Calendar mode.** A view's `calendar` block takes `durationField` and `durationUnit` (`minutes`, `hours`, `days`): a row with no end runs from its start for its duration. `phoneLayout` (`"agenda"`, say) is the layout below 768px until the person picks one; unset, phones are unchanged. The screen's `calendar` takes `classNameOf(row)` and `statusOf(row)`, so a cancelled event can be struck through, with words read out and printed, rather than dropped; `EventCalendar`'s `CalendarEvent` takes `className` and `status`. `defineView` checks the new keys.
  - **Calendar subtitle (fix).** Calendar mode now shows the screen's `subtitle`, else the view's `copy.subtitle`, under its title, as the list does; it used to drop it.
  - **A link picker's order.** `fields.<link>.link.orderBy` is `"view"` (the linked view's `orderBy`, a `position` say) or `{ field, direction }`. Unset, a picker sorts by name as before. `relation.orderBy` on a hand-written relation field and `useLinkOptions`' target `orderBy` do the same; web's RelationField and native's link picker both send it.

## 3.5.0

### Minor Changes

- caf90dd: `NativeResourceView` draws a view as cards with `mode="grid"` (`numColumns`, default 2) and an app's own row or card with `renderCard(row, index, card)`, the names the web's ResourceView uses. `card.pressableProps` gives a custom card the built-in press, long press, label and accessibility actions; `card.item`, `card.actions`, `card.open` and `card.showActions` are there to wire it by hand. Sections, cursor paging, pull to refresh, the empty and error states, the peek and swipe actions all stay. Grid lines are cut from each section's real start, so when `maxPages` drops pages from the front or loads them back, every card stays on its line and nothing remounts; `useNativeResourceView` returns `rowOffset`, the rows dropped above the loaded window. Both are opt in: the default list is unchanged.

  `ScreenContainer` takes `onRefresh` and `refreshing` for pull to refresh on a screen that isn't a list, on the theme-tinted `NativeRefreshControl`, as InboxPage and NotificationsPage have it. `onRefresh` makes the body scroll, since pulling needs a scroll view, so never pass it around a list; without it nothing changes.

  The native starter template's Jest suite runs gestures and animations as written: Gesture Handler's mocks (`jestSetup.js`) and Reanimated's test mode (`setUpTests()` and its resolver), with a test that drives a Pan gesture's shared value through `fireGestureHandler`. The template declares `react-native-gesture-handler` ~3.3.0 (Expo SDK 58's version) as a direct dependency.

### Patch Changes

- 8946a6f: `NativeRecordView` settings send only the fields the person edited, as the web `RecordView` does. The other fields follow the live row, so a stale draft can't overwrite someone else's change, and an edit back to the stored value isn't a change. Both compare through genesis-core's new `sameFormValue` (2 and "2", and null, undefined and "", are the same).

## 3.4.0

### Minor Changes

- 51a7b57: Lists and forms on a phone. The list layouts are opt-in; a few small defaults (keyboards, the list search, the default rows and cards) change existing screens, listed at the end.

  - **Phone default for lists (opt-in).** `ResourceViewDefaultsProvider phoneMode="grid"` (or `"list"`) makes every full-page `ResourceView` (`layout="page"`) open in cards (or rows) on a phone and as a table on a desktop, unless its screen sets a mode. Embedded and compact lists are left alone: an embedded list has no view switch, so cards there would have no way back to the table. `phoneMode={null}` turns an outer provider's default off for a subtree. Without the provider nothing changes. `ResourceView`'s `mode` also takes `{ mobile, desktop }`. Calendar is never a phone default. The server renders the desktop default and a phone switches after hydration; a responsive default ignores a value saved under the older `genesis-view-<key>` key (see docs/RESOURCE-VIEW.md, "Phones").
  - **Table cells that clip (opt-in).** `DataTable clipCells`, or `ResourceViewDefaultsProvider clipCells` for every `ResourceView`, clips a cell's content at its column's edge on one line with an ellipsis, so a long link or email doesn't run over the next column on a narrow table. Inline editors are never clipped. A screen's `slotProps.table.clipCells` wins.
  - **Autofill is the field's call.** No input gets an `autocomplete` token from its type: unset, the attribute is left off, so the browser falls back to its own heuristics and may still offer to fill a field. A view field sets one with `autoComplete` (`fields: { email: { autoComplete: "email" } }`), or `"off"` on a form about someone else, so the browser is asked not to fill in the operator's own details. A view field's `inputMode` and `enterKeyHint` pass through the same way.
  - **`tel` fields.** A new `tel` form type renders `type="tel"`. A `ResourceView` form field, and a `RecordView` settings field, is `tel` when its contract declares `widget: "tel"`; a column's name is never read as a type. `RecordView`'s settings inputs now take the same type, keyboard and autofill hints as a `ResourceForm` input.
  - **Native.** The native form sheet gives a `widget: "tel"` field a `tel` kind and the phone keypad, and passes a view field's `autoComplete`, `inputMode` and `enterKeyHint` to the input.

  Small default changes, on existing screens without a switch:

  - **Keyboards.** Email, `tel` and url inputs ask for their keyboard (`inputMode`). A number asks for the decimal keypad only when its `min` is 0 or more, since that keypad has no minus key on an iPhone. A field's own `inputMode`, `autoComplete` and `enterKeyHint` always win.
  - **List search.** The search box is named for screen readers, shows a search keyboard with a Search key, offers no autofill, and its clear button is a bigger target.
  - **Default rows and cards.** `ResourcePage`'s default list row and card are titled by the page's title (`getTitle`, else `titleField`), not the first column's raw value, and leave that column out of the cells. Cells go through a column's `accessor` and `render`, so a computed column is no longer blank. A row is two lines: the title (up to two), then up to three other columns, wrapping.

- 098f35e: Links can be edited in view forms, with a picker, when the view opts in.

  **Before:** a `defineView` field with `references` was always read-only in a form: never sent, left out of a derived form, and filled hidden from the screen's `filter` or `defaults` when a new row needed it. **After:** the same, unless the view opts the link in, with `fields.<link>.link` (`{}` is enough) or a view-wide `editLinks: true`. An opted-in link is edited with a picker over the linked rows unless it's server-owned (generated, `@genesis readonly`, `permissions.update: false`) or the view marks it `readOnly`, and a derived form includes an opted-in link a new row can't do without (no default, never empty). Scope (tenant) links still never appear in a form, and a link the screen's `filter` pins to one value is filled hidden on create and never sent on edit; one the filter holds to a list (`in`) keeps its picker, offering only the list's rows. **The default flips in 3.0:** every link not marked `readOnly` will get a picker.

  The client can't stop a cross-tenant link: the server must (an INSERT/UPDATE policy `WITH CHECK`, or a composite foreign key). Without `link.view` the picker lists under row-level security only: Genesis keeps no registry of views or tenant columns by resource.

  - **genesis-core:** `fields.<link>.link` (`view`, `preset`, `filter`, `searchFields`) opts a link in and narrows the picker to the linked view's scope, its default preset's filter and the link's own filter (fixed or from the form's values); `editLinks` opts in every link. Each opted-in link's resolved form field carries `link` (`ResolvedLink`: `resource`, `field`, `labelField`, `searchFields`, `filters(scope, values)`). A `view` given as a function that doesn't fit throws in development; in production it's reported (`reportError`, `core:resource-view-link`) and the picker drops the view's filters, so the form still renders. `useLinkOptions(target, { filters, search, untitled })` lists the linked rows through the provider, searched and paged on the server, sorted by the naming field then the key; a row with no name shows `untitled` (default "Untitled"), never its key. `filterParams` and `relationNamingField` are exported; `ViewDefinitionError` moved to its own module (still exported from the same places). A `relation` form field accepts a number key and null, its `relation.labelField` is optional (the provider's `describe` names the rows), and `relation.keys: "row"` hands the form keys as the row holds them.
  - **genesis-ui:** `RelationField` lists through `useLinkOptions`. Its props keep the old signature by default (`value: string`, `onChange(value: string)`, `""` for none); `keys: "row"` takes `value: unknown` and `onChange(string | number | null)`, which a view's links use. Behaviour change for a hand-written `type: "relation"` field too: it lists nothing until it opens, then 25 rows a page from the server, searched on the server (`search` across `relation.searchFields` or the naming field) with Show more, in place of the first 100 rows filtered in the browser; an optional one has None. The trigger is a button with `aria-haspopup="listbox"` (the search input is the only combobox), and the chosen row reads "selected". Copy from the UI catalogue (`link.*`, `common.untitled`). ResourceView maps each opted-in link in a view's form to it.
  - **genesis-ui-native:** the form sheet draws an opted-in link as `NativeLinkPicker` (`kind: "link"`): the list opens in place with search, None and Show more; each choice is a radio with its checked state, and an error is read in the field's label and announced as an alert. `formFieldsFor(view, mode, { pinned, within })` keeps links the screen's filter pins read-only and holds a link to a list filter's rows. The messages catalogue gains an optional `link` block.

  Features: resource-view-links

## 3.3.0

### Minor Changes

- b51031f: `GenesisNativeApp` themes React Navigation. Before, nothing set a dark navigation theme, so in dark mode a header showed black text on a light strip.

  - ui-native: `GenesisModules` takes `navigation`: `{ ThemeProvider, DefaultTheme, DarkTheme }` from `expo-router` in an Expo Router app (it bundles its own React Navigation), or from `@react-navigation/native` otherwise. The new types are `GenesisNavigationModule` and `GenesisNavigationTheme`. The starter passes it.
  - native: with `modules.navigation`, the shell wraps the app in React Navigation's `ThemeProvider`, with a theme for the current mode. The theme takes React Navigation's own light or dark theme, keeps its fonts, and replaces primary, background, card, text, border and notification with the app's role colors. Those are `brandRoleVariables(brand)`, with the app's `brandVariables` map over them when it passes one. `navigationTheme` takes a theme of your own (or `{ light, dark }`); `false` sets none.

## 3.2.2

### Patch Changes

- 9551c52: `NativeRecordView` keeps its whole screen, the switcher, readiness and sections included, in one scroll view with `contentInsetAdjustmentBehavior="automatic"`, so iOS insets it below a translucent navigation bar. Before, the first rows sat behind the bar and couldn't be tapped. A list section is its own (already inset) list, with that top as its header, before any `lists[id].header`. A screen's own section (`slots[id]`) is laid out inside the scroll view, or, given as a function `(top) => node`, owns its scroll view (a long FlatList) and renders the top as its header. Taps reach a section's buttons while the keyboard is up (`keyboardShouldPersistTaps="handled"`).
- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

- 84dc6c8: Package housekeeping, no code changes. genesis-ui and genesis-design-system ship a README (their
  npm pages were empty). chat, collab, native, notifications, sites and supabase ship the MIT
  LICENSE. core, design-system, ui, ui-native, the umbrella and genesis-cli export
  `./package.json`, so tools can read a package's metadata through `exports`. genesis-switchboard's
  repository folder is now `packages/switchboard` (the package name is unchanged). genesis-studio and
  genesis-forms-studio no longer call themselves a "workspace", which in Genesis means where the
  viewer is working.

## 3.2.1

### Patch Changes

- 86e8e26: The optional `@hookform/resolvers` peer now accepts v6 (core and ui-native: `^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0`; studio: `^5.1.0 || ^6.0.0`). v6's listed breaking change is the Effect resolver moving to Effect v4. The zod resolver Genesis uses keeps its API, but builds its errors differently: for a union field it reports the branch with the fewest issues, so an app's messages on union fields can change when it upgrades. Genesis's own forms are unaffected, and the packages' tests now run on 6.0.

## 3.2.0

### Minor Changes

- 5a0c1d2: A record's page is now a **record view**, so "workspace" can mean where the viewer is working (ADR 0004). `defineWorkspace` is `defineRecordView`, `ResourceWorkspace` is `RecordView`, `NativeResourceWorkspace` is `NativeRecordView` (with `NativeRecordViewMenu` and `getNativeRecordViewStackOptions`), and the `Workspace…` types are `RecordView…`. The components take `view` in place of `workspace`, as `ResourceView` does. The old names still work for one minor release, marked deprecated. The doctor rule `ui/record-pages-use-resource-workspace` is now `ui/records-use-record-view`: rename it in an app's config if the app sets its level. Message keys (`messages.workspace`) and default test ids (`resource-workspace`) are unchanged.

## 3.1.0

### Minor Changes

- 4f198a7: NativeResourceView writes like the web ResourceView: form fields carry the contract's `nullable` and `hasDefault`, a create leaves an empty input of a known column out (so its default applies) and an edit clears it to null, while a text column that can't be null keeps `""`. Fields the contract says nothing about still send null. A `filter` value may be a list, sent as `in` and never saved by a create.

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

- 298f8cd: Upgrading: ResourceView and NativeResourceView turn on the form's empty-input handling by themselves, from each field's `nullable` and `hasDefault` in the contract. Before upgrading, (a) regenerate contracts with this release's `genesis introspect`: contracts from an older CLI mark every view column `nullable: true`, so an edit that empties a view's NOT NULL text column would send null; and (b) give defaults to the parameters of any function a `create` rule calls with the whole row as named arguments, since a create now leaves out the keys of inputs left empty.

## 3.0.0

### Major Changes

- 4c5a9f4: Scope-neutral names. Genesis named one app's tenant ("practice") in its scope and clock APIs; it now names whatever the screen is scoped to.

  Breaking:

  - `ResourceScope.practiceId` is gone as a named key. Pass the app's own key in the open slot, as before: `scope={{ practiceId }}`, `scope={{ orgId }}`, `scope={{ leagueId }}`. Views read it as before (`scope: ["practice_id"]` reads `practice_id`, then `practiceId`). To read it typed, augment once: `declare module "@marktiderman/genesis-core" { interface ResourceScope { practiceId?: string } }`.
  - A view field's `timeZone: "practice"` is now `timeZone: "scope"`. `timeZone` is a closed type (`"viewer" | "scope" | TimeZoneName`, the new `TimeZoneName` being `"UTC"`, `"GMT"` or `Area/Location`), so `"practice"` is a type error, and `defineView` throws `ViewDefinitionError` on it (naming the codemod) and on any zone the runtime doesn't know, instead of drawing the column on the viewer's clock.
  - NativeResourceView's `practiceTimeZone` prop is now `scopeTimeZone`; `DisplayTimeZones.practice` is `DisplayTimeZones.scope`, and `resolveZone("practice", …)` is `resolveZone("scope", …)`; `resolveZone` throws on a zone it doesn't know.

  New: `ViewerScope` takes an optional `scopeTimeZone`, the IANA zone of whatever the viewer is scoped to, exposed as `useViewerScope().scopeTimeZone`. When it is absent or empty, the viewer's zone is used. An unknown zone throws in development; in production it is reported once with `reportError` and the viewer's zone is used (the exported `scopeClock` is the check). Web columns with `timeZone: "scope"` read on it (before, the web drew a practice-clock column on the viewer's clock), and NativeResourceView reads its own `scopeTimeZone` prop when given, else the `ViewerScope` value.

  Migrate in one step: `genesis upgrade` runs the `genesis-core-2-scope-names` codemod when genesis-core crosses 2.0.0, or run it by hand with `genesis codemod genesis-core-2-scope-names` (`--dry-run` lists the files). It rewrites `timeZone: "practice"`, `practiceTimeZone` (attribute or object key), `resolveZone("practice", …)` and DisplayTimeZones' `practice` in files that import a Genesis package, and prints the `ResourceScope` augmentation when a file reads `scope.practiceId` and nothing declares it. `genesis doctor`'s `removed-scope-name` rule fails until none are left.

  Migration notes: docs/MIGRATION.md, "Scope-neutral names".

### Patch Changes

- Updated dependencies [1bfdf53]
- Updated dependencies [4c5a9f4]
  - @marktiderman/genesis-core@2.0.0

## 2.9.0

### Minor Changes

- ca5b9e9: - **Relation labels:** a link cell (`relation` hint) shows the linked row's words instead of its id, on web and native, including native's read-only link in the form sheet. The ids on a page go out as one `in` query per linked resource, never one per cell.
  - **`ViewField.labelField`:** names the linked row's field to show. Default: the linked resource's `labelField` (`describe`), else a `name`/`title`-like field. `defineView` refuses it on a field that isn't a link.
  - **A link never shows its raw id:** a linked row the viewer can't see, one that's gone, or a failed read shows `ViewField.missingLabel`, else the new catalogue word `common.hiddenLink` ("Not available") on web and native.
  - **`useRelationLabel(reference, id, { labelField })`** and `loadRelationLabel` in genesis-core, for any screen that shows a link: `undefined` while loading, `null` when there are no words.

### Patch Changes

- f2437dd: - **Fix:** relation labels send each linked id with the type the cell holds (1 and "1" are both sent as given) and match returned rows either way.
  - **Fix:** a native message catalogue written before `common.hiddenLink` still fits; the English is used when it's missing.

## 2.8.1

### Patch Changes

- a082e49: - **ResourceView `defaults`:** values a new row starts with, sent on create only and never a list filter.
  - **ResourcePage `onSaved(row, action)`:** runs after the built-in form saves.
  - **Fix:** an edit no longer sends a field that is read-only on edit (`readOnlyOnEdit`), so saving no longer fails on a column the person may not update. This covers ResourceView's locked fields and its filter-filled hidden fields.
  - **Fix:** an edit with only read-only fields left sends nothing and still succeeds.
  - **Fix:** a `filter` alone no longer turns on New and Edit. Only the view's own form fields do, so `form: []` means a list with no form.
  - **Fix:** the `date` hint shows a timestamp as its day on the column's clock (the viewer's, by default), not its UTC day, on web and native.

## 2.8.0

### Minor Changes

- 41bc738: NativeResourceView sorts within each `groupBy` section by the view's `orderBy` (`defaultSorts: [groupBy, orderBy]`). A provider without `multiSort` still applies only the group sort, so sections stay whole. New `serverSorts(view)`; `serverSort(view)` returns its first entry.

## 2.7.1

### Patch Changes

- 2000540: Badges, form choices, native group titles and read-only form values use the view's `labels` for an enum's words.

## 2.7.0

### Minor Changes

- 796bb53: ResourceWorkspace: one record's screen from a view.

  - `genesis-core/resource-view`: `defineWorkspace(view, { header?: { actions? }, sections, readiness? })`. A section is a child list (`list: { view, filter(row) }`), a few settings (`settings: [...]`, each in `view.writable("edit")`) or a slot the screen fills by `id`. Checked at start-up and frozen; a bad settings field, an unknown header action, a repeated id or a nested workspace throws `ViewDefinitionError`. Pure helpers: `headerFor(row)`, `settingsFields(id?)`, `settingsPatch(id, values)`, `listFilter(id, row)`, `readinessFor(row)` (chip tones only), `readinessSummary(row)` (genesis-core/resource's `readinessOf`), and `isWorkspace`.
  - `genesis-ui`: `<ResourceWorkspace>` puts the header into `AppShellPageHeader` through `ResourceHeader`, registers the sections with `useAppShellSubNav`, draws list sections as embedded `ResourceView`, settings as `SettingsRow` and `ToggleRow` (saving only the section's keys, a zero-row save shown inline as a refusal), and readiness as the `ReadinessChip`. `ResourceHeader` gains a `leading` slot, used for the workspace's `switcher`.
  - `genesis-ui-native`: `<NativeResourceWorkspace>` and `getNativeResourceWorkspaceStackOptions` (title in the navigation bar, actions in the header menu): up to four sections as a segmented control and more as pushed rows, list sections as embedded `NativeResourceView` (its `filter` is the row's `listFilter`), settings as inset grouped rows, readiness as genesis-core/resource's `readinessChip` (its labels in the native messages catalogue) and the checks, and a `switcher` slot.

- 69f509a: NativeResourceView and NativeResourceWorkspace pass the viewer (`useViewer()`) to the view's guards and `when`: cells, the peek, swipe actions, create, header actions and the settings lock. `allowed(view, action, row, screen, viewer?)` and `swipeActionsFor`'s `viewer` option take it for screens that map rows themselves.

  Features: resource-page, resource-workspace

### Patch Changes

- a5a174a: `NativeButton` takes `accessibilityLabel`, `accessibilityHint` and `accessibilityState` (merged with its own `disabled` and `busy`), so a button can say what it is for ("Vote for Dark mode") and whether it is on (`{ selected: true }`).
- 76ea9e4: ResourceView and ResourceWorkspace review fixes.

  - `genesis-core/resource-view`:
    - view actions can be `destructive`; names are trimmed before the checks; `canAction` allows only `true` and turns any other non-reason into a refusal.
    - `rowPicture` takes only http(s) or root-relative image sources.
    - workspaces reject settings that are JSON, lists, links or sensitive, and section keys they don't know.
    - new workspace helpers: `settingsLocked(row)`, `recordId(row)` (by key fields), and `headerFor(row, { can, runnable, served })`.
    - `listFilter` refuses an empty or non-single-valued filter in development; a bad readiness tone falls back to muted with a warning; readiness checks carry a stable `key`.
  - `genesis-ui`: `ResourceWorkspace` shows settings read-only with the reason when update is refused, takes a `can` prop, hides actions nothing can run or the provider doesn't serve, styles destructive actions, and never saves NaN.
  - `genesis-ui-native`: the workspace menu is an action sheet on iOS and a sheet elsewhere (Android alerts show at most three buttons), runs one action at a time, and prefixes accessibility action names. More than four sections open in place with a way back when there is no `onOpenSection`. Settings lock like the web's, and numbers accept a comma decimal and never save NaN. `NativeResourceView` keys rows by the view's key fields.

## 2.6.0

### Minor Changes

- 31e6a0a: `<NativeResourceView view={...} />`: a native list screen from a `genesis-core/resource-view` view, in one line. It reads the same view as the web's `ResourceView`.

  **What maps where:**
  - `view.summary(row)` gives a row's title, subtitle and chip in a `NativeListItem`. The subtitle is the summary's only, never a raw column.
  - The view's `groupBy` gives `SectionList` sections, inset grouped on iOS. The server sorts by it first, so later pages never land mid-section.
  - `view.can()` gives the swipe actions (InboxPage's shape: long press, accessibility actions and a `swipeable` slot). A refused action keeps its place and says why. Delete reads "Move to Bin" when the provider bins deletes.
  - `view.form(mode)` and `view.writable(mode)` give the form sheet, over the record fetched by id. JSON and list fields stay out, and an edit sends only the fields the person changed (a cleared optional value as null). The sheet has Cancel and Save in the bar, sections as groups, native date and time pickers, choices as a segmented control or a list. Read-only fields (a required link, for one) show as text, never inputs. An edit sends only writable keys; a create also saves the screen's `filter` values, so a new row lands in the list it was made from.

  **Behaviour:**
  - Paging is by cursor on `onEndReached`, keeping at most 10 pages, and search waits 300 ms after the last keystroke. Rows are memoised, so typing doesn't redraw them.
  - A read that fails with rows on screen keeps them and shows a banner.
  - Timestamps read on the viewer's clock, or the practice's (`practiceTimeZone`), through `wallClock`.
  - A delete is optimistic and comes back if the server refuses; the refusal shows inline in plain words.
  - A row press calls `onRowPress` (push a detail route) or opens a peek sheet. The peek fetches the record by id, is titled by `summary(row).title`, and shows `view.columns()` drawn like the web's, so `when` and sensitive values stay hidden. Its Edit and Delete follow the guards and the bin wording, and a refused one shows its reason.

  **Also new:**
  - `NativeDetailPanel` takes `title` and `footer`.
  - `useNativeResourceView` is the headless form.
  - `DisplayRenderersProvider` replaces how a display hint draws, with the web's shape. Links and images go through core's `isSafeUrl`, and calendar days are formatted from their parts.

### Patch Changes

- 54447e8: NativeResourceView fixes:
  - An open edit sheet diffs a save against the values it opened with, so a field someone else changed while it was open isn't sent back.
  - Pages that `maxPages` drops from the front load back when the list reaches the top (`onStartReached`), and the rows on screen keep their place (`maintainVisibleContentPosition`). `useNativeResourceView` returns `loadPrevious`, `hasPrevious` and `loadingPrevious`.
  - A create form leaves out the fields the screen's `filter` fixes, since the filter's value is what's saved.
- 10cfaef: NativeResourceView rows draw `summary(row).image` through core's `rowPicture` as the list item's leading picture: the image (decorative unless it has `alt`, with initials if it fails to load), initials alone, or nothing. An unsafe src, or one a phone can't load (a root-relative path), draws initials. `NativeImage` takes `onError`.

## 2.5.0

### Minor Changes

- 6f725f8: - `NativeLoadingState`: a centred spinner in the theme tint for a screen that is waiting (a redirect, a first load), announced as one "Loading" progress bar or by its `label`. Full screen inside the safe area by default; `fullScreen={false}` for a screen body, a section or a list footer.
  - `ScreenContainer` takes `loading` (and `loadingLabel`): the loading state replaces the body inside the same safe area and background.
  - `InboxPage`'s first load and "Loading more" footer use it.

### Patch Changes

- e1de4c1: - `native-screen-layout` counts a route as a screen through `NativeLoadingState` only when a full-screen loading state is all it renders (header options and fragments aside). A route that also renders other content, imports it, or uses `fullScreen={false}` still needs a Genesis layout.
  - Docs: `ScreenContainer`'s `loading` is for first loads (the body is unmounted while it's on); `loadingLabel` is visible and read aloud, so pass translated text; spread `notificationsPushPreferences` after your own keys.

## 2.4.1

### Patch Changes

- 28439ee: Chat on native, from a simulator check: a video pauses when the app goes to the background and when it unmounts, and `ChatThreadScreen focused={false}` (the navigator's `useIsFocused()`) pauses what the thread is playing, since a tab switch keeps it mounted (`pauseChatPlayback`). Each scheduled row's Cancel names its message. The long-press sheet's caption has room under the sheet's top edge and names an app card by its kind's title, as the inbox preview now does (`attachmentPreview`). A newly added topic's chip scrolls into view. The topic and schedule sheets fit their content. A closed topic with no messages says it is closed. App attachment kinds get `{ mine }` as a second argument (`ChatCardContext`), so the sender's card can drop its button.

  genesis-ui-native: `NativeSheet fitContent`, a sheet as tall as its content (on iOS a bottom panel over a scrim, kept above the keyboard; under `NativeSheetProvider`, the library's dynamic sizing).

- c024135: `NativeSheet fitContent`: capped at 90% of the window's height, so long content never grows the sheet under the status bar.

## 2.4.0

### Minor Changes

- 099084a: Native chat: async video messages, link previews and app attachment cards. `ChatVideoRecorder` records in the thread on expo-camera (`modules.camera`): tap to start and tap to send, or hold and let go; flip between takes; the time against the role's limit; close to throw a take away; camera and microphone asked for when it opens. A recording goes through `ChatProvider videoUpload` (a Mux direct upload, minted when recording starts) in resumable chunks (`chunkedPut`, retried and resumed after a dropped connection), with progress and Retry above the composer (`VideoUploadTray`), then is sent through the outbox as a pending Mux attachment; without `videoUpload` it goes to storage as a file. `ChatVideoPlayer` plays HLS and files on expo-video (`modules.video`): poster and duration, tap to play, pause, mute, 1x / 1.5x / 2x, full screen, "Processing" until Mux is done, one at a time with voice notes. `ChatLinkPreviewCard` shows a link's site, title and description under its message (no preview for hidden messages; the image only with `linkPreviewImages`), opening in expo-web-browser when given (`modules.webBrowser`), else the system browser. `ChatAttachmentCard` draws `ChatProvider attachmentKinds` (a form, a check-in) with its button, or `ChatThreadScreen onOpenAttachment`. Genesis UI Native adds the icons `video`, `camera-flip`, `volume`, `volume-off`, `expand` and `stop`.

### Patch Changes

- 9c63a78: Native chat polish:
  - Full emoji picker (`ChatEmojiPicker`, `ChatEmojiPickerSheet`): search, category tabs and a grid, with the person's recent emoji kept with their drafts (cleared on sign-out by `clearDrafts`). About 1,870 emoji are bundled from emojibase-data (MIT), with no network and no CDN, and written as keyboards type them, so a picked 👍 counts with the quick one. The long-press sheet has "+" beside the quick reactions, and the composer has an emoji button that types at the cursor.
  - Photo viewer (`ChatPhotoViewer`): full screen on black instead of a white page sheet, swiping through the tapped message's photos, pinch and double-tap zoom, and swipe down to close. Share and Save to Photos appear when the app passes `modules.sharing` (expo-sharing), `modules.mediaLibrary` (expo-media-library) and `modules.downloadFile`. `ChatMediaViewer` now opens the same viewer.
  - `ChatAutoRetry` / `useChatAutoRetry`: `retryAll()` runs when the app comes back to the front and, with `modules.netInfo`, when the connection comes back (messages the server refused for good, `permanent`, are left alone).
  - The thread shows `ChatAccessError` with Retry (`refetchAccess`) in place of the composer when your role couldn't be read.
  - genesis-ui-native: `NativeFullScreenModal` (full-screen media and camera content, dark by default), and the `smile` and `download` icons.

## 2.3.1

### Patch Changes

- da7fef7: `InboxPage`: `avatarLabel` says who a row's avatar shows when its title doesn't name them (screen readers read it before the title). The docs now say an unread count shows at the end of the row.
- 4514072: `NativeRefreshControl` no longer throws inside `GenesisNativeApp`: its tint is the theme's `tint` role (`useThemeRoles`) rather than `useGenesisTheme` from `providers/native`, a context the shell never mounts. `InboxPage` uses it for pull to refresh, draws its empty and loading states in a scroll view so they sit below a large-title header (and can be pulled to refresh), and takes an `avatar` per row, between the unread dot or count and the text, with the separator starting at the text.

  `NativeIcon` gains the names a chat screen needs, with an SF Symbol and a lucide icon each: `arrow-up`, `camera`, `compose`, `copy`, `file`, `image`, `message`, `mic`, `paperclip`, `pause`, `pin`, `play`, `reply`.

## 2.3.0

### Minor Changes

- 03e1fa0: `InboxPage` and `ThreadPage`, two generic conversation layouts in `SettingsPage`'s iOS inset grouped style.

  `InboxPage`: unread dot or count, a short time, a preview and a status line, pull to refresh, paging and an empty state with an action. Swipe actions are always reachable as accessibility actions and on long press; the `swipeable` slot takes a gesture-handler wrapper for the swipe itself.

  `ThreadPage`: messages with attachments, a read receipt, "load earlier", optimistic sending and retry, and a composer kept above the keyboard through `KeyboardScrollProvider` (or a `KeyboardAvoidingView` without it); `composer={null}` is read-only.

  The React Native type stubs gain the props these use (`accessibilityActions`, `onAccessibilityAction`, `onPressIn` / `onPressOut`, `onContentSizeChange`, FlatList's `refreshControl` and `contentInsetAdjustmentBehavior`), and the test shim renders FlatList headers and footers and accessibility actions.

  `NativeSegmentedControl` shows the selected segment's lift as a style instead of toggling a `shadow-sm` class, which crashed in development when the selection changed (NativeWind's upgrade warning).

- a7db4d0: **`NativeSheet` no longer crashes on open when `@gorhom/bottom-sheet` is installed somewhere in the workspace.** It used the library whenever `require("@gorhom/bottom-sheet")` resolved, but the library throws on open without its `BottomSheetModalProvider` (and needs gesture-handler's `GestureHandlerRootView` and Reanimated), which nothing mounted.

  - By default the sheet is now React Native's own `Modal`, which needs no provider.
    - iOS: the system page sheet (`presentationStyle="pageSheet"`), which follows the finger when swiped down (`allowSwipeDismissal`).
    - Android: a bottom panel over a scrim, drawn under the system bars. A tap on the scrim or back closes it.
    - Content gets the sheet's own safe area, and the bottom inset is padded.
    - `disableBackdropDismiss` keeps it up against every way of dismissing it.
    - A sheet mounted open waits for the Reduce Motion setting before presenting.
  - The library is used only when the app opts in, in either of two ways:
    - `GenesisNativeApp`'s new `bottomSheet` prop (`import * as BottomSheet from "@gorhom/bottom-sheet"`, then `bottomSheet={BottomSheet}`). It mounts the provider inside the data, session and blocks providers, since sheet content renders in the library's portal.
    - The new `NativeSheetProvider`.
    - A module missing an export is reported with `console.error`, and sheets fall back to the modal.
  - On that path:
    - `enableDynamicSizing` is off, so `snapPoints` and `initialSnapIndex` mean what they say.
    - A dismiss that finishes after the app reopened the sheet isn't reported as the user closing it.
  - New `NativeSheetScrollView`: the library's `BottomSheetScrollView` under the provider, React Native's `ScrollView` otherwise. The what's-new notes scroll in it.
  - What may change for existing sheets:
    - The modal adds no padding of its own. The old fallback padded its content with `p-4`.
    - On iPhone the page sheet is nearly full height.
    - Sheets don't move above the keyboard.

  **Classes inside `@marktiderman/genesis-native` now style its screens.** Its exports only pointed at `dist/`, whose JSX tsup compiles to `react/jsx-runtime` calls, which NativeWind's JSX transform never sees, so the update screens' (force upgrade, maintenance, banner, what's new) and the push prompt's `className`s did nothing. Like ui-native, it now ships `src` and has `react-native` export conditions pointing at it, so Metro compiles it with the app's NativeWind transform.

  **`genesisNativewindContent()`** in `presets/nativewind` gives Tailwind the `src` and `dist` globs of every Genesis React Native package the app uses, found the way Node finds them (the app's node_modules, a hoisted workspace root or a workspace link), following their dependencies. `packages` adds starting points (your own wrapper package), and a listed package that isn't installed is warned about. `genesis init --native` and the starter use it in place of hand-written `node_modules` globs, which find nothing when a package is hoisted above the app.

- 46f8fcb: Optional native modules, passed in rather than required: `GenesisModulesProvider` (and
  `GenesisNativeApp`'s `modules`) hands components FlashList v2 (`NativeResourcePage`,
  `NotificationsPage`), expo-image (`NativeAvatar`, new `NativeImage`), Reanimated 4 (toast, drawer,
  skeleton; Reduce Motion respected), expo-glass-effect (new `NativeGlassSurface`: default toasts,
  the update banner, popovers and menus as iOS 26 Liquid Glass when both availability checks pass
  and Reduce Transparency is off), expo-symbols and a lucide icon set (new `NativeIcon` with
  semantic names, `lucideIcons` from `/icons/lucide`), and @expo/ui's drop-in date picker.
  `KeyboardScrollProvider` takes a `toolbar` (`KeyboardToolbar`), shown on `AuthScreen` and
  `SettingsSubPage`; `GenesisNativeApp` takes it as `keyboardToolbar`. Every module left out falls
  back to what the component drew before. `lucide-react-native` is now an optional peer, only the
  `/icons/lucide` subpath imports it, and its range is `>=0.475.0` (the names that subpath uses): an
  app on 0.400-0.474 that never imports it sees a peer warning on upgrade and nothing else.
- 99af0cd: The push block, `@marktiderman/genesis-native/push`: `createPush({ notifications, platform, projectId, backend: supabasePushBackend(supabase), categories, storage, appState, openSettings, links, hold, onOpen })`, a `defineBlock` block (`id: "push"`) for `<GenesisNativeApp blocks={[push]}>`. It contributes a Settings row (`useBlockSettings`, the permission as its subtitle), a bounded boot step that reads the permission, its route and its migration. `NativeAppSlots` gains `pushPrompt`.

  - **Permission**: never asked at launch. `usePushPrompt().offer(reason)` shows a soft pre-prompt (the `pushPrompt` slot, default `PushPromptSheet`) only after a launch grace, while signed in and while the system can still ask, with a cooldown after "Not now" and a cap on how often; its "Turn on" brings up the system prompt.
  - **Registration**: once permission is granted, the signed-in person's Expo push token is registered (`getExpoPushTokenAsync({ projectId })`), again when the OS rotates it, and forgotten on sign-out, account switch and deletion, even after the session has ended; a forget that fails offline is retried at the next start. No `projectId` is reported once, loudly.
  - **Android channels**: `default` plus one per category, private on the lock screen, made before the permission prompt and the token.
  - **Foreground and taps**: a foreground handler (`useSuppressNotifications` hides a screen's own kind), tap routing through `normalizeLink` and GenesisNativeApp's held link (the launching tap too, once), and the badge (`useBadge`).
  - **NotificationSettings**: a `SettingsPage` with `permission`, `categories`, `quietHours` and `privacy` parts, each a slot and a hook (`usePushPermission`, `useNotificationCategories`, `useQuietHours`, `usePrivacyPreviews`); saved at once, put back when a save fails.

  `@marktiderman/genesis-supabase` ships `migrations/0005_genesis_push.sql` (`push_devices`, `notification_preferences`, `push_receipts`, owner-only row level security, functions granted by name, `genesis_push_targets` honouring categories, time-zone-aware quiet hours and hidden previews) with a pgTAP test, and the `genesis-push-send` Edge Function template: Expo sends in batches of 100, neutral text for hidden previews, a receipt per ticket, a receipts poll, `DeviceNotRegistered` devices forgotten, and no token or content in its logs or answers.

  `@marktiderman/genesis-ui-native`: `SettingsPageSection` takes `children`, rendered inside the section's group after its rows, so a pattern built on `SettingsPage` can put a replaced part in the same section. On iOS, `NativeTimePicker` and `NativeDatePicker` render the compact picker alone (it is its own button); the extra button beside it showed the value twice.

  Features: push, push-sender

- e930dda: Native Google sign-in. `@marktiderman/genesis-supabase/native` adds `signInWithGoogle(client, GoogleOneTapSignIn, { digest, randomNonce? })`: a fresh 32-byte nonce, its SHA-256 to Google through the Universal sign-in module's `authenticate({ nonce })`, a check that the ID token carries that hash (`google_nonce_missing` otherwise, before anything reaches Supabase), then `signInWithIdToken({ provider: "google", token, nonce })` with the raw nonce, as Supabase's Google guide describes. `@react-native-google-signin/google-signin` is an optional peer and is passed in, never imported. `@marktiderman/genesis-ui-native` adds `googleProvider({ onPress, label?, icon?, enabled? })` for `AuthScreen`'s `providers`. The Apple nonce docs no longer suggest `randomUUID`: the default is 32 random bytes.

  Features: account

- e930dda: `createNativeQueryClient` defaults queries and mutations to `networkMode: "offlineFirst"` instead of `"always"`. A request still runs once whatever the network says; its retries now pause while NetInfo (through `connectQueryLifecycle`) reports offline and continue when the network is back, and stale queries refetch on reconnect (`"always"` turned `refetchOnReconnect` off, so the NetInfo wiring did nothing). Offline, a query with saved data keeps showing it; one with nothing saved stays `pending` with `isPaused` instead of failing after its retries; a mutation, with no retries by default, still fails at once. Pass `networkMode: "always"` in `defaultOptions` to keep the old behaviour. `NativeResourcePage` shows an offline message (`offlineState` to replace it) in place of the empty state while its list is paused with nothing saved (search and filters stay above it), and its pull-to-refresh spinner stops while a refetch is paused offline. `connectQueryLifecycle`'s cleanup sets the app back online, so no query stays paused on a stale "offline".

  Features: native-app-shell

- b3ee22b: `NotificationsPage`'s section headers stick under the native header instead of under the status bar. Under a large-title header the list runs beneath the header (iOS insets its rows), and FlashList pinned the current header at the list's top, y = 0. It now passes FlashList `stickyHeaderConfig.offset`: by default on iOS the safe area's top plus the compact navigation bar (44 pt, 54 pt from iOS 26; `defaultStickyHeaderOffset`, `iosCompactNavigationBarHeight`), 0 elsewhere; `stickyHeaderOffset` sets it (the safe area's top without a header). React Native's `SectionList` fallback has no offset, so there the headers scroll with their rows when the offset isn't 0. `GenesisListProps` gains `stickyHeaderConfig`.

  Features: native-layouts

### Patch Changes

- 1718648: `FormFocus` no longer uses `InputAccessoryView`, which React Native 0.88 deprecates (Metro warned on every form with a number or phone question). While a keyboard with no return key is up (iOS's number and phone pads before iOS 26), the app's keyboard toolbar (`keyboardToolbar` on `GenesisNativeApp`, react-native-keyboard-controller's `KeyboardToolbar`) shows with its arrows hidden and a done button that says Next (or Send) and moves the step on; iOS 26 shows the pad's return key itself, so the bar stays away there and on every keyboard that has one. Without a toolbar, the form's own Next button stays in view. Next keeps the keyboard up (it calls `preventDefault()` on the done event); Send closes it. `KeyboardToolbarProps` in genesis-ui-native now lists the optional `showArrows`, `doneText` and `onDoneCallback` Genesis may pass (all `KeyboardToolbar`'s own). `FormNativeContextValue` gains `needsKeysBar` and `setNeedsKeysBar`: a hand-built value (a test's mock) needs them.

  `InboxPage` lets a tap in its header land while the keyboard is up (`keyboardShouldPersistTaps="handled"`): the idea board's first tap on "Suggest" pressed nothing and only closed the keyboard.

  Features: forms-native, inbox-thread

- 3e596b9: `SettingsPage` looks like the system Settings app on iOS (inset grouped). Section headers were a full-width gray band with a rule under it. Now a header is an uppercase footnote caption in `secondaryLabel` on the grouped background, inset so it lines up with the cell text. VoiceOver reads the title as written, and the header scales with the footnote Dynamic Type style. Cells sit in groups on `secondarySystemGroupedBackground` with a 16pt margin and UIKit's corner radius (10pt, or 26pt from iOS 26). Hairline `separator` lines run between cells only. They start at the cell text, past any leading icon, and follow right-to-left layouts. The footnote under a group is `secondaryLabel`. On Android a header is a Material subheader in the theme's primary color, with no band. Colors come from `useThemeRoles` and the theme, so they follow dark mode. The slots API is unchanged.
- 0b8987b: Fixes from an end-to-end run of the native starter on an iOS 26 simulator.

  - `NotificationsPage`: the empty state sat under the large-title header, behind the Dynamic Island. It is now in a scroll view with `contentInsetAdjustmentBehavior="automatic"`, as the list is, so iOS insets it below the header and above the tab bar; pull to refresh works on it too.
  - `SettingsSubPage`: with `KeyboardToolbar`, the toolbar floated about a tab bar's height above the keyboard, and with the keyboard closed it showed above the tab bar. The keyboard-scroll layout no longer pads its bottom edge (the toolbar sticks to the keyboard from that edge); the scroll view's automatic inset keeps the last field clear instead.
  - Starter: `genesis-starter://check-in?gym=hilltop`, the link the check-in screen documents, opened Home. The link map now has `/check-in` (with `features.checkIn` on).

- 0fd477c: Fixes from running the native starter on an iOS simulator.

  **PKCE uses S256 on React Native.** Hermes has no `crypto.subtle`, so supabase-js sent the PKCE challenge as `plain` (the verifier itself), and with no `crypto` at all made the verifier with `Math.random`. `createGenesisSupabase` takes `crypto` (`import * as ExpoCrypto from "expo-crypto"`), which installs `crypto.getRandomValues` and a SHA-256-only `crypto.subtle.digest` on `globalThis` from it, never replacing real WebCrypto. A PKCE client made with neither, on any platform, throws in development and logs an error in a release build. With the polyfill in place, `auth.getClaims()` always has the server check the token (`getUser`), because the polyfill can hash but can't verify a signature; supabase-js would otherwise try to verify asymmetric tokens locally and throw. `installWebCrypto`, `hasPkceCrypto`, `assertPkceCrypto` and `isDigestOnlyPolyfill` are on `/native`.

  **The keyboard moves the form.** `GenesisNativeApp` takes `keyboardProvider` (react-native-keyboard-controller's `KeyboardProvider`) and mounts it once around the app. `keyboardScroll`'s `KeyboardAwareScrollView` did nothing without it. It is read once, so an inline wrapper can't remount the app. In development, `keyboardScroll` without `keyboardProvider` logs an error. The ui-native `KeyboardScrollProvider` docs say it needs `KeyboardProvider` above it.

  **Genesis components are styled under NativeWind v4.** New `presets/nativewind` (`genesisNativewindPreset`): the Tailwind v3 preset plus the theme's role colors (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as `hsl(var(--…))`) and their variables, light on `:root` and dark under `prefers-color-scheme: dark`, with the same values as `themes/genesis.css`. With `presets/tailwind` alone, none of those classes were generated and `--radius` was never declared, so inputs had black square borders and primary buttons had no fill. The CLI's scaffolder writes the new preset into an Expo app's Tailwind config.

- 697c18c: `GenesisNativeApp` mounts `NativeToastProvider` around the screens, so `useToast()` from genesis-ui-native works on every screen without the app mounting one (it threw before). Toasts sit at the top by default, where a tab bar can't cover them; `toast={{ position, disableAnimation }}` places them and `toast={null}` leaves the provider to the app. A top toast now sits below the safe area's top (the status bar and the Dynamic Island) when a `SafeAreaProvider` is above it. `FeedbackForm` takes `sentAlert={false}` to leave the confirmation to `onSent`; the starter shows a toast after a sent report.

  Features: native-app-shell, native-components, support-feedback

## 2.2.0

### Minor Changes

- 47b13ff: The Account block, native first. `@marktiderman/genesis-supabase/native` adds `signInWithApple(client, AppleAuthentication, { digest })` (availability check, name and email scopes, a SHA-256 hashed nonce, `signInWithIdToken`; closing Apple's sheet is `{ canceled: true }`, and the full name Apple shares on the first sign-in comes back to save) and `completeOAuthRedirect(client, url)` (exchanges a PKCE `code`, or returns the redirect's `error` as a typed `GenesisAuthError`). `@marktiderman/genesis-supabase` adds `deleteMyAccount(client)` and ships `migrations/0001_genesis_account_deletion.sql` (`public.delete_my_account()`, security definer, `search_path = ''`, executable by `authenticated` only) with a pgTAP test. `@marktiderman/genesis-ui-native` adds `appleProvider()` and `AppleSignInButton`, which draw Apple's own button on iOS and nothing elsewhere; `AuthScreen` skips `null` providers and `SocialAuthProvider` takes a `render` for a provider's own button.

  Features: account

### Patch Changes

- e649267: From review of the Account block.

  `completeOAuthRedirect` passes `sb_flow_id` to `exchangeCodeForSession` and returns `redirectType` (`"recovery"` after a password reset). A redirect error's `message` is now fixed copy chosen by its code; the redirect's own `error_description` is only on the new, untrusted `GenesisAuthError.providerMessage`. `redirectParams` reads keys such as `constructor`.

  `signInWithApple` returns Apple's `authorizationCode`, which a server needs in order to revoke the Apple tokens on deletion; the README documents that step under "Not covered yet". It refuses a digest that isn't lowercase hex (`bad_digest`), and keeps `fullName` on the error result.

  `delete_my_account()` now:
  - refuses an aal1 session when the person has a verified MFA factor (`42501`);
  - runs `private.genesis_before_account_delete(uuid)` first when an app defines it, and maps a refusal from it to `GA001`;
  - comes with `private.genesis_require_recent_sign_in(interval)`, which an app can call from that hook to require a recent sign-in (`GA002`).

  The migration header is corrected: Supabase documents that a person who owns Storage objects can't be deleted (`23503`), and the comment about blanket grants is fixed.

  `AppleSignInButton` ignores a second tap while a sign-in is open, reports disabled and busy on the button itself, and its `label` and `height` docs are corrected.

  Features: account

- a38a00f: Fixes found by building the native starter (`apps/genesis-rn-starter`, Expo SDK 58 / React Native 0.88) on the packages.

  - `@marktiderman/genesis-ui-native`: `AppleButtonModuleLike`'s button now types `style` as a `ViewStyle`, so the real `expo-apple-authentication` module can be passed to `appleProvider` and `AppleSignInButton` under strict TypeScript (with `unknown` it was refused). `ScreenContainer` compiles against React Native 0.88, which dropped `translucent` and `backgroundColor` from `StatusBar`'s props (Android is always edge to edge there); they are still passed for earlier versions. `NativeTextarea`'s `rows` is documented (the generated docs showed React Native's Android-only `rows` description for it).
  - `@marktiderman/genesis-design-system`: `./presets/*` and `./providers/native` gain a `default` export condition, so a CommonJS loader (NativeWind's Tailwind v3 config loader, Metro) resolves them; before, `tailwind.config` importing `presets/tailwind` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  - `@marktiderman/genesis-cli`: the doctor's `store-readiness` rule counts export compliance and the privacy manifest as set when the Expo config lists this package's own config plugin, which sets them (unless its `exportCompliance` / `privacyManifest` option is `false`, and the manifest only when a dependency needs one). Apps on `withGenesis()` no longer get those two warnings. In a dynamic config, only `withGenesis(` or the package's name outside an `import` / `require` counts as listing the plugin.
  - `@marktiderman/genesis-supabase`: the README had merge-conflict markers between the Account section and "Choices, and why"; both sections are kept.

  Features: native-starter

## 2.1.0

### Minor Changes

- 7ae53e5: From review: `AuthForm`'s return key on the email field moves focus to the password field (React Native doesn't do it by itself) and keeps the keyboard open, and both fields carry AutoFill hints (`textContentType`, `autoComplete`). `AuthScreen` keeps the form above the keyboard and, in development on iOS, warns when a third-party provider is offered without Sign in with Apple (App Store Review Guideline 4.8). `SettingsPage` takes its colors from theme roles: on iOS, inset rounded cells on the grouped background, like the Settings app. `ScreenContainer` takes a `style`. `NotificationsPage` no longer builds a new separator component on every render.
- ddac1fc: `AuthScreen`: a whole sign-in screen from props, assembling `AuthBranding`, `SocialAuthRow`, `AuthForm` and `ForgotPasswordLink` (shown for password sign-in when `onForgotPassword` is set), plus a footer. Each part (`branding`, `social`, `form`, `footer`) is a slot. `NotificationsPage` takes `slots` and `slotProps` for `sectionHeader`, `row` and `empty`; the `emptyState` prop still works. Defaults render as before.

  Features: native-components

- 2657c06: `SettingsPage` takes `slots` and `slotProps`, the same contract as web patterns (from `@marktiderman/genesis-core/slots`). Replace or drop (`null`) any of `sectionHeader`, `row`, `footnote` and `dangerousActions`; your component receives exactly the props the default would (`SettingsPageSlotMap`), and `slotProps` feeds a default part more props. The rendered output and test ids are unchanged.

  Features: native-components

- d7b0389: The native `GenesisThemeProvider` takes `syncNativeAppearance`: on the root provider it passes an in-app light or dark choice to `Appearance.setColorScheme`, so iOS system colors and native controls follow it, not only Genesis tokens; "system" and unmounting hand it back to the OS ("unspecified", or "auto" on React Native 0.87+). The react-native-keyboard-controller peer range starts at 1.11 (KeyboardAwareScrollView). `KeyboardScrollProvider` lets an app supply react-native-keyboard-controller's `KeyboardAwareScrollView` once; `AuthScreen` and `SettingsSubPage` use it, and fall back to `KeyboardAvoidingView` without it. `NotificationsPage` memoizes its date grouping. The genesis-supabase README explains the Keychain storage choice, the URL polyfill and where to call `refreshWhileActive`.

  Features: design-tokens, native-layouts, supabase-kit

- a154019: Theme roles, from review: off iOS, `destructive` is a text-safe red in both schemes (the dark token was a background red at about 2:1); dark-mode `surface` is raised above `groupedBackground` the way iOS grouped lists are (they were inverted); the default `tint` comes from the Genesis brand preset instead of a literal. `resolveThemeRoles({ androidDynamic })` and `useThemeRoles({ materialYou })` use Material You dynamic colors on Android 12+.

  Features: theme-roles

- bd07203: Theme roles: twelve colors named for what they are for (`background`, `groupedBackground`, `surface`, `label`, `secondaryLabel`, `tertiaryLabel`, `separator`, `fill`, `tint`, `destructive`, `success`, `warning`), resolved per platform. `resolveThemeRoles({ target, scheme, platformColor, tint })` in the design system gives the theme's CSS variables on web, iOS system colors through `PlatformColor` on iOS, and the Genesis token for the current scheme on Android, so Android dark mode follows the system. A brand sets `tint`. The design system has no React Native import; ui-native adds `useThemeRoles({ tint })`, which reads the platform and color scheme itself.

  Features: theme-roles

### Patch Changes

- e91765c: From review: `keychainStorage` queues reads with writes (a read could see the old generation disappear mid-read), lets every chunk write settle before reporting a failure (so a late write can't outlive the sweep), and removes chunks before the manifest. `refreshWhileActive`'s unsubscribe also stops auto-refresh. `wipeSessionOnReinstall` removes every indexed PKCE flow verifier and the index. `defineFeatures` skips schema-invalid entries in its relation checks instead of throwing, and `statusOn` treats `node` in `apps` as the `server` platform. `SettingsPage` rows are transparent so the theme-role cell color shows.

  Features: supabase-kit, feature-registry, native-components

## 2.0.3

### Patch Changes

- 1a9d899: Release-pipeline only, no code changes. This version is published by CI through npm Trusted Publishing, which now requires the `npm` GitHub environment (main only).

## 2.0.2

### Patch Changes

- 7cfc703: First publish from the new public repo. No functional changes — every package's current version already matches what's published from the predecessor repo, so this bump is required before this repo's release workflow can publish anything at all (npm rejects republishing an existing version).

## 2.0.1

### Patch Changes

- 88ad204: Fix Badge `success`/`warning`/`info` status text failing WCAG AA contrast. The variants rendered same-hue text on a tinted chip (e.g. `text-success` on `bg-success/15`), measuring ~1.9–3.1:1 against the 4.5:1 AA floor. Native now uses the AA-safe darker status token (`text-success-dark` etc. → ~6.3–7.4:1); web uses the matching 700-weight ramp (`text-emerald-700`/`text-amber-700`/`text-blue-700`, with `dark:` 300 stops for the darkened chip). Chip backgrounds and all other variants are unchanged.
- 38d08d3: Design-system self-consumption (dogfooding) cleanups.
  - **design-system:** the React Native theme (`nativeThemeLight` / `nativeThemeDark`) is now generated from the canonical DTCG themes (`tokens/dtcg/themes/{light,dark}.json`) via a Style-Dictionary target, instead of a hand-rolled palette hardcoded in `providers/native.ts`. Behavior-preserving — the resolved light/dark surface colors are byte-identical to the previous literals. The `brand-genesis` neutral ramp drift (stops `300` and `900`) is corrected to match the canonical DTCG source, so there is one palette.
  - **ui-native:** `Input`, `Textarea`, and the nav-bar search field now default `placeholderTextColor` to the design-system `nativeColors.neutral[400]` token instead of a hardcoded hex (input/textarea unchanged visually; the nav-bar moves off an off-palette gray onto the zinc scale).

- e37afdd: Declare `className` on `NativeTextProps`. `NativeText` already applies `className` internally, but its public type inherited the prop from react-native's `TextProps` via NativeWind's global augmentation, which does not resolve across the RN 0.85 / nativewind 4.2 / react-native-css-interop 0.2 type matrix — so consumers type-checking against the real react-native types saw `Property 'className' does not exist on NativeTextProps`. The prop is now declared explicitly, matching the implementation and every other ui-native primitive (Button, Tooltip, ChipGroup).
- Updated dependencies [38d08d3]
- Updated dependencies [1e56f68]
  - @marktiderman/genesis-design-system@1.1.0

## 2.0.0

### Major Changes

- e972635: Rename the npm scope from the old pre-public scope to `@marktiderman` across all Genesis packages: `genesis-*` → `@marktiderman/genesis-*`.

  The data-layer package additionally shortens its name to `@marktiderman/genesis-switchboard` (dropping the redundant `data-` prefix while keeping the `genesis-` family prefix consistent with the other packages).

  **Breaking change.** Consumers must update every import specifier and dependency entry (e.g. `genesis-ui` → `@marktiderman/genesis-ui`, and `genesis-data-switchboard` → `@marktiderman/genesis-switchboard`). Per npm best practice the previous pre-public-scope names will be `npm deprecate`d with a pointer to the new names once the `@marktiderman/*` packages are published. The legacy `genesis@2.0.0` umbrella package under the old scope is unaffected (separate lineage).

### Minor Changes

- 54a8afb: Add tokens-only layout primitives (`Stack`, `Inline`, `Box`, `Grid`) plus the `spaceScale` token and `spacingClass()` resolver. Promoted from the Acme incubator (PRD-46 WC-A4); primitives own all gap/padding/margin via the spacing token so spacing stays consistent and never hard-codes a px value.

### Patch Changes

- 41cd84d: Mark `react-native` as an optional peer dependency (`peerDependenciesMeta`), matching the other React Native peers (nativewind, gesture-handler, reanimated, …) that are already optional here. This makes the `@marktiderman/genesis` umbrella's promise true: a pure-web consumer that pulls `genesis-ui-native` transitively no longer gets an unmet `react-native` peer warning at install. Native apps are unaffected — they depend on `react-native` directly at their app root. A new web-install smoke test (`packages/genesis/scripts/smoke-web-install.mjs`) packs the umbrella + granular deps and asserts the web-only install is react-native-clean.
- Updated dependencies [e972635]
  - @marktiderman/genesis-core@1.0.0
  - @marktiderman/genesis-design-system@1.0.0

## 1.1.0

### Minor Changes

- a4d4872: feat(theme): unified `<GenesisThemeProvider>` + `useTheme()` API across web and native (PRD-07 A2b).

  `useTheme()` returns the same TypeScript shape on web + native:
  `{ brand, mode, resolvedMode, setMode, tokens }`. Build-time codegen via the
  `tailwindFromBrand` (web) / `themeFromBrand` (native) factories shipped in
  A4.0 (the cross-platform-factory spike) feeds the provider's runtime layer; consumers no
  longer maintain three parallel theme mechanisms.

  This PR ships the unified API ADDITIVELY behind the `GENESIS_THEME_V2` env
  flag. The legacy v1 native provider at
  `@marktiderman/genesis-design-system/providers/native` continues to work — it
  will be removed in the final commit of A2b once visual parity is confirmed
  on `apps/sample` + `apps/sample-native`, OR in a follow-up `G-PR-3b` PR if
  parity is deferred. See `docs/MIGRATION.md` `v0.2.x → v0.3.0`.

  Ships in v1.1.0.

### Patch Changes

- 0f73e78: fix: critical bug fixes for Accordion / Slider / Drawer / Combobox / Toast primitives + surface gaps from Acme migration.
  - `accordion`: replace NativeWind-incompatible `last:` Tailwind variant with an `isLast` prop, AND auto-detect the trailing item via `Children.toArray()` so consumers don't have to thread the prop manually. Manual `isLast` always wins over auto-detection.
  - `slider` / `range-slider`: wrap `PanResponder` in `useMemo` keyed on `value` / `width` / `min` / `max` / `step` / `onChange` so closures never read stale mount-time values; fix `snap()` math so non-zero `min` produces the correct discrete grid.
  - `drawer`: same `useMemo` pattern keyed on `side` / `drawerWidth` / `onOpenChange` so swipe-to-dismiss threshold + direction track the latest props.
  - `combobox`: wrap option list in `<ScrollView keyboardShouldPersistTaps="handled">` so long lists scroll; close the dropdown on input blur (with a 120ms delay so option-press still registers) so users can dismiss without selecting.
  - `toast`: hold the latest `onDismiss` in a ref so the auto-dismiss `setTimeout` doesn't re-arm on every parent render.
  - `exports`: add `./utils` subpath so consumers can `import { cn } from "@marktiderman/genesis-ui-native/utils"` without pulling the components barrel.
  - `types`: re-export `TextPreset` as a named type alongside `NativeText` / `NativeTextProps`.

- Updated dependencies [0f73e78]
- Updated dependencies [a4d4872]
  - @marktiderman/genesis-design-system@0.2.2

## 1.0.1

### Patch Changes

- Critical bug fixes for Accordion / Slider / Drawer / Combobox / Toast
  primitives, surface gaps surfaced by the Acme migration, and a new
  `./utils` subpath export, and a `TextPreset` named type re-export.
  No breaking API changes; the new `./utils` and `TextPreset` exports
  are additive, and all bug fixes are drop-in compatible with 1.0.0
  call sites.

  **Component fixes:**
  - `accordion`: replace NativeWind-incompatible `last:` Tailwind variant
    with an `isLast` prop, AND auto-detect the trailing item via
    `Children.toArray()` so consumers don't need to thread the prop
    manually. Manual `isLast` always wins over auto-detection.
  - `slider` / `range-slider`: wrap `PanResponder` in `useMemo` keyed on
    `value` / `width` / `min` / `max` / `step` / `onChange` so the
    gesture handler closures never read stale mount-time values; fix
    `snap()` math so non-zero `min` produces the correct discrete
    grid (`Math.round((clamped - min) / step) * step + min`).
  - `drawer`: same `useMemo` pattern keyed on
    `side` / `drawerWidth` / `onOpenChange` so swipe-to-dismiss
    threshold + direction track the latest props.
  - `combobox`: wrap option list in
    `<ScrollView keyboardShouldPersistTaps="handled">` so long lists
    scroll instead of clipping; close the dropdown on input blur (with
    a 120ms delay so option-press still registers) so users can dismiss
    without selecting.
  - `toast`: hold the latest `onDismiss` in a ref so the auto-dismiss
    `setTimeout` doesn't re-arm on every parent render — the timer now
    runs to completion based on the toast's `duration` alone.

  **Surface gaps (Acme migration follow-ups):**
  - Re-export `TextPreset` as a named type alongside `NativeText` /
    `NativeTextProps`. Defined as `NonNullable<NativeTextProps["preset"]>`
    so it stays single-source-of-truth on the cva variants.
  - Add `./utils` subpath export so consumers can
    `import { cn } from "@marktiderman/genesis-ui-native/utils"` without
    pulling the entire components barrel (and react-native) into
    util-only consumer trees (e.g. brand packages).

  **Install:**

  ```sh
  pnpm add @marktiderman/genesis-ui-native@1.0.1
  ```

## 1.0.0

### Major Changes

- 00b2743: First publish from the canonical `marktiderman/genesis` repo. Bumps the existing `@marktiderman/genesis-*` v0.1.0 packages (originally published 2026-04 from prior fork repos PRD-07 Phase A6 retires) to v0.1.1 with the canonical genesis-repo content. Consumers install with zero auth: `pnpm add @marktiderman/genesis-ui-native`. Each publish emits a Sigstore provenance attestation linking the tarball back to this commit + the workflow run via OIDC. Publishing infrastructure: Changesets + `changesets/action` + `.github/workflows/release.yml` using **OIDC Trusted Publishing** (no NPM_TOKEN secret; short-lived token issued at publish time via GitHub Actions identity).
- Updated dependencies [5020d70]
- Updated dependencies [210aa8f]
- Updated dependencies [00b2743]
  - @marktiderman/genesis-design-system@0.2.0
  - @marktiderman/genesis-core@0.1.1
