---
"@marktiderman/genesis-forms-builder": minor
---

**Breaking: the domain-specific templates are gone.** `TEMPLATES` used to include three templates written for one kind of business (ids `after-class`, `monthly-pulse` and `intake`). Starting points for a domain belong to the app, not to Genesis, so `TEMPLATES` now holds only a blank form:

- New `BLANK_TEMPLATE` export. `TEMPLATES` is now `[BLANK_TEMPLATE]`, and `getTemplate` returns `undefined` for the old ids.
- `getTemplate(id, templates?)` takes your own list to search (default `TEMPLATES`). `FormTemplate` is unchanged.

Migration: define your own templates as `FormTemplate[]` (start with `...TEMPLATES` to keep "Blank form", and add `...STARTER_TEMPLATES` for the opt-in neutral examples), show them in your New-form picker, and pass them to `getTemplate(id, yourTemplates)`. If you used the old ones, copy their definitions from `packages/forms-builder/src/templates.ts` at the tag `@marktiderman/genesis-forms-builder@0.1.1`.
