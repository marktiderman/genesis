---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-supabase": patch
---

Support reports become findings someone can fix and the person can verify, and the web feedback panel is easier to use. Existing apps keep working unchanged: the new database parts need migration 0003, and what writes to them is opt-in.

- New migration `migrations/0003_genesis_support_findings.sql` in the `support-feedback` block (after 0006, with its pgTAP test): a `severity` column; report handlers, named by an optional app hook `private.genesis_support_report_handler(report, person)`, who read a report and its screenshots, reply as support and set its status besides staff (`support_handles`); and a verify loop: a report someone else marks addressed asks its person to check the fix, and `support_verify_report` confirms it or reopens it (`resolved_at`, `verified_at`, `reopened_at`). Its reply trigger keeps the support-email block's rules when that block is installed first.
- Severity: `FeedbackRecord.severity`, kept in the report's `context.severity` by default. With migration 0003 applied, `severityColumn: true` on `createSupportClient` / `createSupabaseSink`, and `GENESIS_SUPPORT_SEVERITY_COLUMN=true` on the intake function, write the `severity` column.
- Client: optional `verify` and `handles` on `SupportClient` (a client of the app's own keeps compiling; check for them before calling), and `pinned`, `aboutLabel` and `page` on `SupportReport`. New helpers `isSitePath`, `cleanLabel`, `pageOf` and `reportHeading`.
- Web panel: an `about` suggestion the person can drop, a severity choice for bugs, a draft the host can hold (`useFeedbackDraft`, `draft`) so stepping aside to capture or pin loses nothing, `captureOnOpen` and `captureRequest`, a thanks that replaces the form with Send another and an optional `onOpenHelp`, a message when the browser didn't allow a screenshot, a removable pin, and tabs and choices that fit a narrow sheet. `FeedbackLauncher` holds the draft and gives each return from stepping aside a fresh Sheet.
- `useFeedbackShortcut` (`/web`): opens feedback with ⌘⇧. or Ctrl+Shift+., ignoring key repeat and rich-text editors.
- Web report thread (`/web-chat`): headed by the report's own words (a real `h2`), its kind once, the page it was sent from (a link only when it's a path on this site), and an optional `focusHeading`. The conversation keeps the report's title; `plainChatTitle` titles it "Report" instead.
- Types accept `undefined` on optional fields for apps compiled with `exactOptionalPropertyTypes`; the wire contract's two copies stay identical.
- genesis-supabase: the intake function also writes the `severity` column when `GENESIS_SUPPORT_SEVERITY_COLUMN=true`; it always keeps severity in `context`.

Features: support-feedback, support-chat
