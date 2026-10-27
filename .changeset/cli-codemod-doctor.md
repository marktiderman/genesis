---
"@marktiderman/genesis-cli": minor
---

- The first registered codemod, `genesis-core-2-scope-names` (genesis-core 2.0.0's scope-neutral names), and `genesis codemod [id] [--dir] [--dry-run]` to list codemods or run one by hand.
- Doctor rules for the scope rename: `removed-scope-name` (error) lists every removed "practice" name left in a file that imports Genesis (`timeZone: "practice"`, `practiceTimeZone`, `resolveZone("practice")`, DisplayTimeZones' `practice`), so `doctor --strict` fails until the codemod has run; `scope-practice-id` (info, never failing) notes a `scope.practiceId` read with no `ResourceScope` augmentation.
- Two more doctor rules: `resource-view-tree` (error) flags a `<ResourceView>` or `<ResourcePage>` with `tree` and `pagination="server"` or `"cursor"`, which throws when it renders; `studio-server-auth-import` (warn) flags deep imports of studio-server files and a CommonJS `require` of its ESM-only root, pointing at `@marktiderman/genesis-studio-server/auth`. A correct project passes `genesis doctor --strict`.
