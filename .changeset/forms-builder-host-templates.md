---
"@marktiderman/genesis-forms-builder": minor
---

**Breaking: the coaching templates are gone.** `TEMPLATES` used to include after-class feedback, monthly pulse and new-member intake forms. Those belong to the app, not to Genesis, so the builder now ships only a blank form:

- New `BLANK_TEMPLATE` export. `TEMPLATES` is now `[BLANK_TEMPLATE]`, and `getTemplate("after-class")` (or `"monthly-pulse"`, `"intake"`) returns `undefined`.
- `getTemplate(id, templates?)` takes your own list to search (default `TEMPLATES`). `FormTemplate` is unchanged.

Migration: define your own templates as `FormTemplate[]` (start with `...TEMPLATES` to keep "Blank form"), show them in your New-form picker, and pass them to `getTemplate(id, yourTemplates)`. If you used the old ones, copy their definitions from `packages/forms-builder/src/templates.ts` at the tag `@marktiderman/genesis-forms-builder@0.1.1`.
