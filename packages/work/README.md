# @marktiderman/genesis-work

Goals and projects, tasks and issues, metrics, status updates and sessions, in the app's own Supabase.
Every table lives in the `genesis_work` schema, so nothing collides with the app's own tables.

| Block | Migration | What it adds |
|---|---|---|
| `pursuits` | `0001_genesis_work_pursuits.sql` | Goals and projects in one table (a pursuit is a goal, a project or both), nesting, period, health and criteria. Work items: tasks, issues and milestones |
| `metrics` | `0002_genesis_work_metrics.sql` | Numbers tracked over time: one value per period (weekly, monthly, fiscal quarters and years), goals that change over time, sources, rollup rules |
| `status-updates` | `0003_genesis_work_updates.sql` | Dated updates (health and a note) on any of the above, and requests to a person for an update by a due time |
| `sessions` | `0004_genesis_work_sessions.sql` | Meetings, workshops, presentations, coaching calls, one-on-ones, classes and planning days: types with agendas, the live step, attendees and guests, ratings, links |

## Install

1. Add genesis-supabase's `owner-access` block, and define its two hooks in your own migration
   (`genesis_owner_can`, `genesis_readable_owners`). Without them, nobody signed in reads or writes.
2. Run `genesis add pursuits` (and `metrics`, `status-updates`, `sessions`), then `genesis migrate`.
3. Add `genesis_work` to the schemas your API exposes (`supabase/config.toml`, `[api] schemas`).

## Owners and tenants

Every row has a tenant and exactly one owner: a person (`person_id`), a team (`team_id`) or the
tenant itself (`organization_id`). Who may read and write is your app's answer, through the
owner-access hooks. Add your own foreign keys in a later migration.

## Extending

Never change a genesis-work table. Add your own table keyed by the row's id, plus a view that joins
the two. Custom fields and content packs are coming next.

## Status

Experimental and private until its first publish.
