# Responsive contract

How every Genesis web component behaves from a 320px phone to a wide desktop, and what an app on
Genesis may rely on. The components hold these rules so a screen doesn't have to; an app that
needs one of them to bend does it through a prop, never by overriding a component's markup.

The rules come from WCAG 2.2, the platform guidelines (Apple HIG, Material 3) and the way the
leading design systems (Polaris, Primer, shadcn) handle the same problems. Sources are listed at
the end.

## The ten rules

Each rule says what the components do today. What they don't do yet is under "Known gaps".

1. **The shell answers to the viewport; a list answers to its own width too.** AppShell
   switches on the viewport: a header and bottom tab bar below `md` (768px), the rail from `md`,
   the full sidebar from `lg`. Breakpoints are Tailwind's (`sm` 40rem, `md` 48rem, `lg` 64rem,
   `xl` 80rem), in rem so they follow the person's font size. A list (`ResourceView`) also
   measures its own frame, because the same list sits in a full page on a phone and in a 360px
   side panel on a wide screen (rule 4). Other components still switch on the viewport.
2. **Nothing scrolls the page sideways.** Every screen reflows at 320 CSS px wide (WCAG 1.4.10:
   1280px at 400% zoom). Only a data grid, a map or code may scroll sideways, inside its own
   frame. A page header keeps its title beside the actions, truncating it; when the actions (or
   a list's toolbar in them) can't fit beside 10rem of title (its icon included), they take their
   own line and wrap within it rather than push past the edge.
3. **Every target is big enough to hit.** At least 24×24 CSS px everywhere (WCAG 2.5.8), and a
   44×44px hit area on a coarse pointer (WCAG 2.5.5, Apple's 44pt). Buttons, inputs, selects,
   tabs and menu items grow to 44px under `pointer-coarse`. Switch, Checkbox, RadioGroupItem,
   a pressable Chip and ChipGroupItem keep their look and take an invisible 44px hit area
   instead (`touchTarget`, from `@marktiderman/genesis-ui`), so desktop density stays. On touch,
   RadioGroup and ChipGroup space their items (unless the app sets a gap) so one's hit area doesn't
   land on the next, and a
   table's selection column widens so the checkbox's area stays inside it.
4. **A list turns into rows when it is narrow.** A list is narrow on a phone (a viewport below
   768px, in either orientation) and, inside a `ResourceView`, when its own frame is under
   40rem. There a responsive default (`{ mobile, desktop }`, or an app's `phoneMode`) takes its
   narrow side, `phoneMode` covers page and embedded lists alike, and cards stack in one column.
   A row keeps whatever the screen drew in a cell (`cells`): a custom title cell (a link, reorder
   buttons) is the row's title, and an action column (Restore) shows beside the first three
   columns. A list row or card is never a button itself (a cell may draw a link): a row opens from
   its own Open button and a card from its title, so the controls in them stay reachable by
   keyboard and screen reader, and a click on one never opens the row. A list whose point is its columns (a sheet, a
   comparison grid) says so with its own `mode` and scrolls inside its frame.
5. **The overlay fits the job.** A short confirmation is the centred dialog. A picker or a short
   form docks to the bottom on a phone (`DialogContent mobileLayout="sheet"`). A long form, an
   editor or media fills the screen (`mobileLayout="fullscreen"`). Side sheets (a record's form,
   its peek) fill a phone's width below `sm`; a navigation drawer that should stay narrow says
   so (`max-sm:w-72`).
6. **Overlays fit the screen.** Overlays cap their height with `dvh` and scroll inside
   themselves; the body doesn't scroll behind them. An app sets
   `interactive-widget=resizes-content` in its viewport meta, so in Chrome and Firefox the
   on-screen keyboard shrinks the layout instead of covering a sheet's footer. Safari doesn't
   support it (see Known gaps).
7. **Everything fixed to an edge pads for the safe area.** The header, the tab bar, sheets and
   dialogs pad with `env(safe-area-inset-*)`. The insets are zero unless the app's viewport meta
   has `viewport-fit=cover`. Keyboard focus never comes to rest under a fixed or sticky bar
   (WCAG 2.4.11): AppShell's scroller keeps a scroll padding the size of the phone's bottom bar (and
   of the sticky header when the window scrolls), and a table's rows keep a scroll margin the height
   of its sticky pager.
8. **Nothing hides behind hover.** Hover styles apply only where hover exists (Tailwind 4's
   `hover:`); an action shown on hover has a tap and keyboard path too (a row menu, the peek).
9. **One floating control at most, and it never covers.** On a phone with a bottom tab bar, put
   the help launcher in the header (`SupportMessengerLauncher variant="icon" position="inline"`),
   not over the page, where it would sit on the right-hand column of switches, row menus and
   pagers; float it (the default `position`) from `md` up only. A page with its own bottom action
   doesn't render the floating launcher.
10. **A fixed rem scale, reduced motion respected, and widths tested.** App UI uses the fixed rem
    type and spacing scale (density changes it, not the viewport; fluid `clamp()` type is for
    marketing pages). Motion turns off under `prefers-reduced-motion`. Screens are checked at
    320, 375, 768, 1024 and 1280px, at 200% zoom, with touch emulation, and with one list in a
    narrow panel on a wide screen (the `NarrowPanel` story does the last).

## Known gaps

- Only lists answer to their own width. Card walls, form grids and toolbars outside a list still
  switch on the viewport; moving them to container queries is the next step.
- Safari ignores `interactive-widget`, so there the keyboard can cover a sheet's footer; a
  VisualViewport fallback isn't built.
- Nothing publishes the tab bar's height for floating elements to offset by; an app positions
  its own floating control.
- A chip narrower than 44px can still overlap its neighbour's hit area side to side.
- The checks in rule 10 run by hand and in Storybook (Chromium) today, not across browsers in CI.

## In an app

- Don't override a component's markup to make it fit (a global selector on its classes, an
  arbitrary variant reaching into its parts). If a component doesn't hold a rule above, it is a
  Genesis gap: raise it, and work around it only through the component's props.
- Write layout phone first and add `sm:`/`md:`/`lg:` for wider screens. For a part of your own
  that may also appear in a panel, prefer Tailwind's `@container` variants.
- A form is one column on a phone: fields side by side use `grid gap-3 sm:grid-cols-2`.

## Sources

- WCAG 2.2: Reflow (1.4.10), Resize text (1.4.4), Text spacing (1.4.12), Content on hover or
  focus (1.4.13), Target size minimum (2.5.8) and enhanced (2.5.5), Focus not obscured (2.4.11):
  https://www.w3.org/WAI/WCAG22/Understanding/
- Container queries, Baseline widely available since August 2025:
  https://web.dev/blog/baseline-digest-aug-2025, https://tailwindcss.com/docs/responsive-design#container-queries
- Window size classes (Material 3): https://developer.android.com/develop/ui/compose/layouts/adaptive/window-size-classes
- Tables as lists on small screens: https://shopify.dev/docs/api/app-home/polaris-web-components/layout-and-structure/table
- Page header actions on narrow screens: https://primer.style/product/components/page-header/guidelines
- Dialog on desktop, drawer on mobile: https://ui.shadcn.com/docs/components/drawer
- Viewport meta and the on-screen keyboard: https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element,
  https://developer.chrome.com/blog/viewport-resize-behavior
- Touch targets: https://developer.apple.com/design/human-interface-guidelines/accessibility,
  https://m3.material.io/foundations/designing/structure, https://tailwindcss.com/blog/tailwindcss-v4-1
- Messenger launchers on mobile: https://developers.intercom.com/installing-intercom/web/attributes-objects
