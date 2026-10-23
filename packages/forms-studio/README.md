# @marktiderman/genesis-forms-studio

The workspace around a [Genesis Forms](../forms/README.md) builder: the page header, the
Responses tab, the Settings page and the Share dialog. It stores nothing. The host passes the
form's rows and handles every action (save, publish, mark handled, reply), so any app can use it.

```css
@import "tailwindcss";
@import "@marktiderman/genesis-ui/styles.css";
@import "@marktiderman/genesis-forms-studio/styles.css";
```

## The page

```tsx
import {
  ResourceHeader, ReadinessChip, formNavItems, formStatusChip, FORM_NAV_ICONS,
  formAvailability, formCounts, readinessOf,
} from "@marktiderman/genesis-forms-studio";
import { AppShellPageHeader, AppShellSubNavEnd, useAppShellSubNav } from "@marktiderman/genesis-ui/layout";

useAppShellSubNav(
  formNavItems(`/forms/${form.id}`, { ...formCounts(definition), responses }, FORM_NAV_ICONS),
  { mode: "tabs" },
);

<AppShellPageHeader>
<ResourceHeader
  title={form.title}
  parent={<Link to="/forms">Forms</Link>}
  status={formStatusChip(formAvailability(form), form.version)}
  saveState="saved"
  onUndo={builder.undo} onRedo={builder.redo}
  onPreview={openPreview} onShare={openShare}
  publish={{ onClick: publish, label: form.version ? "Publish changes" : "Publish" }}
/>
</AppShellPageHeader>
<AppShellSubNavEnd><ReadinessChip readiness={readinessOf(analysis.findings)} /></AppShellSubNavEnd>
```

- `formNavItems("/forms/f1", { questions, logic, responses })` declares the form's four child items
  (Questions, Logic and endings, Responses, Settings) as `?tab=` links with their counts as badges,
  for the app shell's `useAppShellSubNav`. `formCounts(definition)` gives the first two.
- `ReadinessChip` ("Ready to publish", or "3 problems to fix") goes in the row's trailing slot,
  `<AppShellSubNavEnd>`. `readinessOf(analysis.findings)` reads it from the builder's checks.

## Responses

- `ResponsesToolbar`: the Summary / Each response switch, the host's filters and its export
  actions (a Sheet, Download CSV).
- `ResponsesFilters`: when (presets or dates), choice filters over extra columns (a class, a
  coach), a rating floor, and the low-ratings chip. Its value goes through `toResponseFilter` and
  `filterResponses`.
- `HeadlineNumbers` with `headlineNumbers(items, definitions, { previous })` and `headlineCards`:
  Responses (and the change against the period before, from `comparisonFilter`), Average rating,
  Low ratings, and the consent or yes/no rate.
- `QuestionSummaryCards` from `summarizeResponses`: each rating's spread with low scores marked,
  choice counts, consent and yes/no as one split bar, and the latest written answers.
- `FollowUpList` from `needsFollowUp(items, { isHandled })`: low-rated responses, newest first,
  with the host's actions on each.
- `PhotoAnswer` (`{ photos, resolveUrl }`): a response's photos as thumbnails, each opening full
  size in a new tab. The host resolves each reference to an address it may show (a short-lived
  signed link, say) or null; a photo most browsers can't draw (HEIC) is a tile with its name and an
  Open link, and one that can't be found says "Photo unavailable". In cells and CSVs a photo answer
  is its file names.

## Settings

`ResourceSettingsPage` puts every section on one page with jump links ("On this page"); each
section is a `SettingsSection` card whose rows are genesis-ui `SettingsRow` and `ToggleRow`. A
section without `content` is a jump link only, for a part of the page the host renders elsewhere.

## Share

`ShareDialog`: the link with Copy, a QR code and poster (the host draws it), embed code, and a
prefilled-link builder (`prefilledUrl`).

## Rules only

`@marktiderman/genesis-forms-studio/rules` has the pure functions without React, for a server:
`summarizeResponses`, the filters, `answerColumns`, `answersByKey`, `answerCell`, `toCsv`,
`carryAnswers`, `formAvailability`, `takesResponses`, `prefilledUrl`, `embedSnippet` and the rest.

## Generic pieces

`src/generic/` holds what isn't about forms: `ResourceHeader`, `ReadinessChip`,
`ResponsesToolbar`, `HeadlineNumbers`, `SummaryCard`, `FollowUpList`,
`ResourceSettingsPage`, `SettingsSection`, `ShareDialog` and their words. Courses, lessons and
worksheets use the same page pattern, so these are meant to move to genesis-ui.
