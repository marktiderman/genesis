# @marktiderman/genesis-work

## 0.2.0

### Minor Changes

- e941603: Features: content-pack-install

  `@marktiderman/genesis-work/packs`: the first generic content packs, one file each under `src/packs/`. The weekly team meeting is a 60-minute agenda. One-on-ones is a 30-minute agenda led by the person's own topics. Quarterly objectives brings a planning session and a confidence field on goals. `workPacks` lists all three. A test checks every pack against both the TypeScript shape and the installer's database rules (key format, session kinds, metric units).

## 0.1.0

### Minor Changes

- a601da2: New migration `0005_genesis_work_fields.sql` and the `custom-fields` block. A tenant can add its own fields to goals, projects, tasks, issues, metrics and sessions, with no code or migration.
  - Fields use genesis-forms field types.
  - Values sit in a `custom` jsonb keyed `<namespace>.<key>`, with a GIN index. The database checks their shape; the full validation runs on the server.
  - An app's or a content pack's fields are written only by server code.
  - A field's type is fixed once rows hold values for it.

  Features: custom-fields

- 6fc7f55: New migration `0006_genesis_work_packs.sql` and the `content-pack-install` block.
  - **Install:** server code calls `genesis_work.install_content_pack(tenant, manifest, person)`. Session types, metric templates (a new tenant catalog), custom fields and labels (the tenant's words) become the tenant's own editable rows. Each row keeps its source pack, version, key and content hash.
  - **Reinstall or update:** installing again changes nothing. A newer version updates only what nobody changed, and keeps and reports what the tenant customized.
  - **Uninstall:** `uninstall_content_pack` removes only items nobody touched or used, and never touches people's data.

  Features: content-pack-install

- a211c61: New package, `@marktiderman/genesis-work`, which adds the `genesis_work` schema to the app's own Supabase. Its four blocks use genesis-supabase's owner-access contract.
  - **`pursuits`:** goals and projects (a pursuit can be either or both), with tasks, issues and milestones.
  - **`metrics`:** numbers over time, one value per period, with fiscal quarters and years and goals that change over time.
  - **`status-updates`:** updates on a pursuit, work item or metric, plus requests to someone for an update.
  - **`sessions`:** meetings, workshops, presentations, coaching calls, one-on-ones, classes and planning days, with agendas, attendees, guests and ratings.

  Each block has a pgTAP test.

  Features: pursuits, metrics, status-updates, sessions
