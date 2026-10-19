# @marktiderman/genesis-studio

## 0.1.0

### Minor Changes

- 8b251da: **Genesis Data Studio, milestone P0 — "fix a real row"** (docs/DATA-STUDIO.md). Two new packages, first published at 0.1.0.

  - **`@marktiderman/genesis-studio-server`** — a web-standard `Request → Response` handler that always acts as the signed-in user over a direct Postgres connection (`set local role` plus their verified claims, per transaction). Schema discovery with per-user column rights, list and read, and a single-cell update that is version-checked under a row lock, confirms the database advanced the version, and commits its audit entry in the same transaction. Composite keys. A deny-by-default `authorize()` (`byResource` for the common case) that can never grant more than the database. `supabaseAuth` / `jwtAuth`, the `genesis-studio-server sql` setup migration (tamper-proof audit log), and a browser client at `/client`.
  - **`@marktiderman/genesis-studio`** — `<DataStudio>`: a table sidebar and a sheet grid built on genesis-ui's `ResourcePage`, with in-place edits whose outcome is shown (saved with its audit entry, or not saved and why). Routing through an adapter (`createSearchParamsRouter`, `useHistoryRouter`, `useMemoryRouter`); sign-in is a slot. Experimental.
