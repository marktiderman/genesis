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
  formNavItems, formStatusChip, FORM_NAV_ICONS, formAvailability, formCounts,
  FORM_READINESS_LABELS, FORM_READINESS_OPTIONS,
} from "@marktiderman/genesis-forms-studio";
import { ResourceHeader, ReadinessChip, readinessOf } from "@marktiderman/genesis-ui/resource";
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
<AppShellSubNavEnd>
  <ReadinessChip
    readiness={readinessOf(analysis.findings, FORM_READINESS_OPTIONS)}
    labels={FORM_READINESS_LABELS}
  />
</AppShellSubNavEnd>
```

- `formNavItems("/forms/f1", { questions, logic, responses })` declares the form's four child items
  (Questions, Logic and endings, Responses, Settings) as `?tab=` links with their counts as badges,
  for the app shell's `useAppShellSubNav`. `formCounts(definition)` gives the first two.
- `ReadinessChip` ("Ready to publish", or "3 problems to fix") goes in the row's trailing slot,
  `<AppShellSubNavEnd>`. `readinessOf(analysis.findings, FORM_READINESS_OPTIONS)` reads it from
  the builder's checks (`no-questions` is "empty"), and `FORM_READINESS_LABELS` says "Add a
  question" for an empty form.

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
- Partial responses, for a form that saves answers as they go (`settings.saveProgress`): give each
  item its `status` (`in_progress`, `partial`, `completed`) and, unfinished, its `furthest`
  question (genesis-forms `formProgress`'s `fieldId`). Filters show sent and partial responses by
  default (summaries count both; the Responses card says how many are partial);
  `<ResponsesFilters statuses>` adds the status menu (Sent and partial, Sent, Partial, In
  progress).
- `<DropOffByQuestion {...dropOffSummary(items, definitions)} />`: how many people started
  (distinct responses of any status), then for each question how many people reached it, how
  many stopped there, and the drop-off share. Pass every response under your filters except
  status. Each response is followed on its own path (genesis-forms `computePath`): a sent one
  reached the questions on it; a partial one, those before its furthest, then its furthest,
  where it stopped; in-progress ones count only as started. Give each item its `hidden` inputs
  and, by field key, any `extraAnswers` you keep apart (contact details), so logic reading them
  is followed. Two things a stored response can't tell count as on the path: a question a
  prefilled link answered and hid (`hideWhenPrefilled`), and a rule comparing a host-list pick
  to its value when you store the pick as its label. `dropOffByQuestion` alone gives the
  questions.
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

`ShareDialog` (genesis-ui): the link with Copy, a QR code and poster (the host draws it), embed
code, and a prefilled-link builder (`prefilledUrl`). genesis-ui's defaults say "page"; pass
`{...FORM_SHARE_LABELS}` for "Share your form" and "Anyone with the link can answer." (this
package's deprecated `ShareDialog` does that for you).

## Rules only

`@marktiderman/genesis-forms-studio/rules` has the pure functions without React, for a server:
`summarizeResponses`, the filters, `answerColumns`, `answersByKey`, `answerCell`, `toCsv`,
`carryAnswers` (re-exported from genesis-forms), `formAvailability`, `takesResponses`,
and the rest (`prefilledUrl`, `embedSnippet` and `dayLabel` are still here, deprecated: they
moved to `@marktiderman/genesis-ui/resource/rules`). For a forms list: `slugFromTitle` ("How was class?" →
`how-was-class`), `SLUG_PATTERN` and `validateSlug`, and for a duplicate `copyTitle` ("Copy of …")
and `freeSlug` (the first of `slug`, `slug-2`… not taken). `offersSubmitAnother` says whether a
thank-you page offers "Send another response" (never on a one-response-per-person form that isn't
anonymous).

## Moved to genesis-ui

The pieces that aren't about forms now live in genesis-ui's resource workspace, so courses,
lessons and worksheets use the same page: `ResourceHeader`, `ReadinessChip`, `readinessOf`,
`readinessChip`, `ResponsesToolbar`, `HeadlineNumbers`, `SummaryCard`, `FollowUpList`,
`ResourceSettingsPage`, `SettingsSection`, `ShareDialog`, `Chip`, `dayLabel`, `SAVE_STATE_LABEL`,
`prefilledUrl`, `embedSnippet` and their types. Import them from
`@marktiderman/genesis-ui/resource` (the pure ones also from `/resource/rules`, safe on a
server).

This package still exports every one of those names, marked `@deprecated`, and they behave as
before: the deprecated `ShareDialog`, `ReadinessChip`, `readinessOf` and `readinessChip` pass the
form's words and rule (`FORM_SHARE_LABELS`, `FORM_READINESS_LABELS`, `FORM_READINESS_OPTIONS`),
since genesis-ui's defaults are neutral. `SettingsPageSection` is genesis-ui's
`ResourceSettingsSection` (renamed, because genesis-ui's `SettingsPage` already has a
`SettingsPageSection`).
