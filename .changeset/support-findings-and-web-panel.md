---
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-supabase": minor
---

Support reports become findings someone can fix and the person can verify, and the web feedback panel and report thread gain opt-in improvements. Existing apps keep working and look the same: the new database parts need migration 0003, and every new visible behaviour is behind an option, except the few listed at the end with why.

- New migration `migrations/0003_genesis_support_findings.sql` in the `support-feedback` block (after 0006, with its pgTAP test): a `severity` column; report handlers, named by an optional app hook `private.genesis_support_report_handler(report, person)`, who read a report and its screenshots, reply as support and set its status besides staff (`support_handles`); and a verify loop: `support_verify_report` lets the person confirm a fix or reopen the report (`verified_at`, `reopened_at`; addressed and wont_fix stamp `resolved_at`). The prompt that asks the person to check a fix in the thread is off unless the app's hook `private.genesis_support_verify_prompt_enabled()` returns true; it is marked as the system's (`support_replies.prompt`), posts at most once an hour per report, and when a reply rule or limit refuses it the status change still goes through. Its reply trigger keeps the support-email block's rules when that block is installed first.
- Severity: `FeedbackRecord.severity`, always kept in the report's `context.severity`. With migration 0003 applied, `severityColumn: true` on `createSupportClient` / `createSupabaseSink`, and `GENESIS_SUPPORT_SEVERITY_COLUMN=true` on the intake function, also write the `severity` column.
- Client: optional `verify` and `handles` on `SupportClient` (a client of the app's own keeps compiling; check for them before calling), and `pinned`, `aboutLabel` and `page` on `SupportReport`. New helpers `isSitePath`, `cleanLabel`, `pageOf` and `reportHeading`.
- Web panel, opt-in: `severity` (a severity choice for bugs), `thanksReplacesForm` (the thanks takes the form's place, with Send another and an optional `onOpenHelp` button), `about` (a suggestion the person can drop), `draft` with `useFeedbackDraft` (a draft the host holds, so stepping aside to capture or pin loses nothing), `captureOnOpen` and `captureRequest`. `FeedbackLauncher` holds the draft and gives each return from stepping aside a fresh Sheet, so its overlay no longer stays drawn over it.
- `useFeedbackShortcut` (`/web`): opens feedback with ⌘⇧. or Ctrl+Shift+., ignoring key repeat and rich-text editors.
- Web report thread (`/web-chat`), opt-in: `reportHeading` (the report's own words in a real `h2`, its message only when it adds something, and the page it was sent from, a link only when it's a path on this site), `focusHeading` (focuses that heading; turns `reportHeading` on) and `plainChatTitle` (the conversation titled "Report" instead of the report's title).
- Types accept `undefined` on optional fields for apps compiled with `exactOptionalPropertyTypes`; the wire contract's two copies stay identical.
- genesis-supabase: the intake function also writes the `severity` column when `GENESIS_SUPPORT_SEVERITY_COLUMN=true`; it always keeps severity in `context`.

On by default, and why:

- Layout only: the panel's tabs share the bar and truncate, and its choice rows wrap and start under their labels, so a long label or a narrow sheet no longer overflows. Nothing is added or removed.
- A placed pin shows as a row ("Pinned to a spot on this page.") with Remove. It shows only the pin the panel already holds, which the Pinned button already announced, and Remove undoes a pin that could not be undone before.
- When the browser refuses a screenshot the panel says so instead of showing nothing; it appears only after that failure, and the report can still be sent.
- The "Write a few words first." error goes as soon as the person types.

Features: support-feedback, support-chat
