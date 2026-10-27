# @marktiderman/genesis-work

Goals and projects, tasks and issues, metrics, status updates and sessions, in the app's own Supabase.
Every table lives in the `genesis_work` schema, so nothing collides with the app's own tables.

| Block | Migration | What it adds |
|---|---|---|
| `pursuits` | `0001_genesis_work_pursuits.sql` | Goals and projects in one table (a pursuit is a goal, a project or both), nesting, period, health and criteria. Work items: tasks, issues and milestones |
| `metrics` | `0002_genesis_work_metrics.sql` | Numbers tracked over time: one value per period (weekly, monthly, fiscal quarters and years), goals that change over time, sources, rollup rules |
| `status-updates` | `0003_genesis_work_updates.sql` | Dated updates (health and a note) on any of the above, and requests to a person for an update by a due time |
| `sessions` | `0004_genesis_work_sessions.sql`, `0007_genesis_work_bookings.sql` | Meetings, workshops, presentations, coaching calls, one-on-ones, classes and planning days: types with agendas, the live step, attendees and guests, ratings, links. 0007 adds attendees by person record (through genesis-supabase's viewer-people hook), RSVPs, capacity with bookings and a waitlist (`book_session`, `cancel_booking`, `session_places`), check-in (`check_in`), recurring series that make dated sessions (`extend_series`), RSVPs coupled to places (`rsvp_session`: going books or waitlists, maybe or declined gives the place back, for one session or the rest of its series), an RSVP close time, and an optional app hook that refuses a booking (`private.genesis_booking_allowed`). Add your foreign key for `session_attendees.attendee_person_id`: it's required, or someone who may write a session can book any uuid as a person |

| `custom-fields` | `0005_genesis_work_fields.sql` | A tenant's own fields on goals, projects, tasks, issues, metrics and sessions, with no code or migration |
| `content-pack-install` | `0006_genesis_work_packs.sql` | Install a content pack (session types, metric templates, custom fields, labels) into a tenant's own editable rows |

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

Never change a genesis-work table. Instead:

- **Custom fields** (the `custom-fields` block): a tenant adds fields in Settings, with no code. The
  values sit in `custom`, keyed `<namespace>.<key>`. Validate them on the server with the genesis-forms
  engine; the database checks their shape.
- **Your own table**, keyed by the row's id, plus a view that joins the two, for fields you filter or
  join heavily.
- **Content packs** bring session types, metric templates, fields and labels. A pack is defined in
  code; server code installs it with `genesis_work.install_content_pack(tenant, manifest, person)`.
  Installed items are the tenant's own, editable rows. Installing again or a newer version keeps
  what the tenant changed, and uninstalling removes only what nobody touched or used.

## Content packs

`@marktiderman/genesis-work/packs` holds the generic packs. Each is a `defineContentPack` manifest that server code installs into one tenant with `genesis_work.install_content_pack(tenant, manifest, installed_by)`:

- `weeklyTeamMeetingPack`: a 60-minute weekly meeting agenda.
- `oneOnOnesPack`: a 30-minute one-on-one.
- `quarterlyObjectivesPack`: a quarterly planning session and a confidence field on goals.

`workPacks` lists them all. An app publishes its own packs the same way, from its own package.

## Status

Experimental and private until its first publish.
