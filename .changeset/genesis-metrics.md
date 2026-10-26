---
"@marktiderman/genesis-supabase": minor
---

New migration `0010_genesis_metrics.sql` and the `metrics` block: numbers tracked over time. A metric has an owner (a person, a team or the tenant), a unit type, a cadence, a goal and direction, leading or lagging, a rollup rule, a template key and a source (manual, formula or a sync). Each period has at most one value, and a value always takes its metric's tenant and owner. Goal changes are kept, and `metric_values_with_goal` shows each value against the goal of its period. Access uses the same app hooks as the pursuits block. A pgTAP test sits beside the migration.

Features: metrics
