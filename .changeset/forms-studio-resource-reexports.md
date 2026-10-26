---
"@marktiderman/genesis-forms-studio": minor
---

The resource workspace pieces moved to genesis-ui (`@marktiderman/genesis-ui/resource`). forms-studio re-exports every moved name, marked `@deprecated`, and forms see the same words as before: the deprecated `ShareDialog`, `ReadinessChip`, `readinessOf` and `readinessChip` pass the form's wording and its `no-questions` rule. New `FORM_SHARE_LABELS`, `FORM_READINESS_LABELS` and `FORM_READINESS_OPTIONS` carry those words for hosts that import from genesis-ui directly. `SettingsPageSection` is now an alias of genesis-ui's `ResourceSettingsSection`. The genesis-ui peer floor is now 2.14.0.

Features: forms-studio, resource-workspace
