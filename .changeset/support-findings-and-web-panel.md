---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-supabase": patch
---

Support reports become findings someone can fix and the person can verify, and the web feedback panel is easier to use.

- New migration `migrations/0003_genesis_support_findings.sql` in the `support-feedback` block (after 0006, with its pgTAP test): a `severity` column the person sends; report handlers, named by an optional app hook `private.genesis_support_report_handler(report, person)`, who read a report and its screenshots, reply as support and set its status besides staff (`support_handles`); and a verify loop: a report someone else marks addressed asks its person to check the fix, and `support_verify_report` confirms it or reopens it (`resolved_at`, `verified_at`, `reopened_at`). Its reply trigger keeps the support-email block's rules when that block is installed first.
- Client: `verify` and `handles` on `SupportClient` (an app with its own `SupportClient` implementation adds them), `severity` on `FeedbackRecord` (sent by the Supabase sink and the intake sink), and `pinned`, `aboutLabel` and `page` on `SupportReport`. New helpers `isSitePath`, `cleanLabel`, `pageOf` and `reportHeading`.
- Web panel: an `about` suggestion the person can drop, a severity choice for bugs, a draft the host can hold (`useFeedbackDraft`, `draft`) so stepping aside to capture or pin loses nothing, `captureOnOpen` and `captureRequest`, a thanks that replaces the form with Send another and an optional `onOpenHelp`, a message when the browser didn't allow a screenshot, a removable pin, and tabs and choices that fit a narrow sheet. `FeedbackLauncher` holds the draft and gives each return from stepping aside a fresh Sheet.
- `useFeedbackShortcut` (`/web`): opens feedback with ⌘⇧. or Ctrl+Shift+., ignoring key repeat and rich-text editors.
- Web report thread (`/web-chat`): headed by the report's own words (a real `h2`), its kind once, the page it was sent from (a link only when it's a path on this site), and an optional `focusHeading`.
- Types accept `undefined` on optional fields for apps compiled with `exactOptionalPropertyTypes`; the wire contract's two copies stay identical.
- genesis-supabase: the intake function writes `severity` to its column as well as `context`.

Features: support-feedback, support-chat
