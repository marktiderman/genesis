---
"@marktiderman/genesis-cli": minor
---

- The first registered codemod, `genesis-core-2-scope-names` (genesis-core 2.0.0's scope-neutral names), and `genesis codemod [id] [--dir] [--dry-run]` to list codemods or run one by hand.
- Two doctor rules: `resource-view-tree` (error) flags a `<ResourceView>` or `<ResourcePage>` with `tree` and `pagination="server"` or `"cursor"`, which throws when it renders; `studio-server-auth-import` (warn) flags deep imports of studio-server files and a CommonJS `require` of its ESM-only root, pointing at `@marktiderman/genesis-studio-server/auth`. A correct project passes `genesis doctor --strict`.
