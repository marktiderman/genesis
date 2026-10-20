---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-studio-server": minor
"@marktiderman/genesis-studio": minor
"@marktiderman/genesis-cli": minor
---

**The Data Studio turns on in any app, for every table.**

- **genesis-cli:** `genesis studio init` writes one migration to review (the studio's `NOINHERIT` login and the audit trail), the server and a page, then prints the remaining steps. The server is a Next.js route, or a Supabase Edge Function for Vite and Lovable apps.
- **studio-server:**
  - **`supabaseStudio({ url, database })`:** the handler for a Supabase project in one call.
  - **`databaseDecides()`:** every table, every action, bounded by the user's grants and row-level security. `who` defaults to any signed-in, non-anonymous user.
  - **No version trigger needed.** A table without a trusted version column is checked against a fingerprint of the row's readable values (`VersionField.kind: "row"`), so it's editable and stale edits are still refused. A configured `versionField` that can't be trusted still makes the table read-only.
  - **Policies are read too.** A granted table that no row-level security policy lets you update, insert or delete shows that action as off, with the reason, instead of failing on every try.
  - **CORS:** the handler answers preflights for `allowedOrigins`, so it can run on another origin.
  - **`supabaseAuth` inside the local Supabase stack** (`http://kong:8000`) also accepts the browser's localhost issuer. Hosted projects keep the exact issuer check.
  - **`createSupabaseStudioProvider(supabase)`** in `/client`: it sends the session's token and reports user changes.
- **studio:**
  - `router` is optional (the page's query string), and no `sessionKey` is needed with a provider that reports its session.
  - **`standalone.css`:** every class the studio uses, prebuilt, for apps without Tailwind v4. Its small reset applies only inside the studio and its pop-ups, and the app's own theme variables win.
- **core:** `VersionField.kind` may be `"row"`.
