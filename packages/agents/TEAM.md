# The team and its settings

This product's settings and who holds each role. It is the only file that names sessions:
[RULES.md](./RULES.md) speaks in roles. Change this file when ownership changes, including when a
session adopts an orphaned area.

## Settings

| Setting | Value |
|---|---|
| Staging batch | `staging/genesis-rn` (each app repo sets its own, e.g. `staging/<date>/<letter>`) |
| Release path | the batch's release pull request into `main`, then the version packages pull request |
| Lease length | 24 hours without a push |
| Owner's stops | npm publishes (first versions by hand), the version packages merge, store and TestFlight submissions, destructive actions |

## Areas

| Area | Paths | Area owner |
|---|---|---|
| Product system and agent process | `packages/agents`, `packages/product` (planned) | Compass |
| Sites and chat, including their wiring into apps | `packages/sites`, `packages/chat` except `src/native`, and their sample-app demos (`apps/sample/app/routes/sites*.tsx`, `apps/sample/app/routes/chat.tsx`, `apps/sample/sites-demo`) | Weaver |
| React Native and notifications | `packages/native`, `packages/ui-native`, `packages/chat/src/native`, `packages/notifications`, `apps/genesis-rn-starter` | Forge (also the releaser of the batch, and hands the owner first-publish commands) |
| Forms, and app batches and releases | `packages/forms*`; app batches and releases live in each app repo, not here | Quill (app batches with whoever cut them) |

Shared, so every area owner is told before a change: `packages/support`, `packages/supabase` (its
migrations), `packages/ui`, `packages/design-system`, `packages/core`, `packages/features`,
`packages/genesis-cli`, `packages/studio` and `packages/studio-server`.

Unowned, so ask the owner first: `packages/data-switchboard`, `packages/extension` and
`packages/genesis`. The owner may name an area owner for any shared or unowned package.

The owner (human) holds direction, every schema decision, secrets and the stops above.
