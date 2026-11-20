---
"@marktiderman/genesis-support": patch
"@marktiderman/genesis-supabase": patch
---

Support fixes from the release review:

- The server handler's screenshot allowlist is a `Map`, so a part typed `constructor` (or any `Object` member) is never an allowed type.
- When the store refuses the dump brought with a piece of feedback, the notification names no dump (it named one that doesn't exist).
- Without `waitUntil`, the handler waits at most 5 seconds for its notifiers before answering, so a hung notifier can't make the client retry and file the report twice.
- GitHub issues: the admin link's `(`, `)`, `<` and `>` are percent-encoded, so an `adminUrl` can't close the link early; a long title is cut to GitHub's 256 characters after neutralising (the issue was refused with 422 and lost).
- Reply by email: an HTML-only reply laid out in `<header>` is read whole (`<head` inside `<header>` dropped everything after it).
- `lucide-react` is declared (an optional peer, as genesis-notifications does): `/web-boards` and `/web-chat` import it.
- The privacy note says the dump's size, hourly limit and retention are defaults the app's settings can change.
- genesis-supabase README: a direct database login's setting writes are recorded as `database`, not `server` (the service role's are `server`).
