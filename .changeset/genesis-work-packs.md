---
"@marktiderman/genesis-work": minor
---

New migration `0006_genesis_work_packs.sql` and the `content-pack-install` block.
- **Install:** server code calls `genesis_work.install_content_pack(tenant, manifest, person)`. Session types, metric templates (a new tenant catalog), custom fields and labels (the tenant's words) become the tenant's own editable rows. Each row keeps its source pack, version, key and content hash.
- **Reinstall or update:** installing again changes nothing. A newer version updates only what nobody changed, and keeps and reports what the tenant customized.
- **Uninstall:** `uninstall_content_pack` removes only items nobody touched or used, and never touches people's data.

Features: content-pack-install
