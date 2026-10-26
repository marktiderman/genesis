---
"@marktiderman/genesis-work": minor
---

New package, `@marktiderman/genesis-work`, which adds the `genesis_work` schema to the app's own Supabase. Its four blocks use genesis-supabase's owner-access contract.
- **`pursuits`:** goals and projects (a pursuit can be either or both), with tasks, issues and milestones.
- **`metrics`:** numbers over time, one value per period, with fiscal quarters and years and goals that change over time.
- **`status-updates`:** updates on a pursuit, work item or metric, plus requests to someone for an update.
- **`sessions`:** meetings, workshops, presentations, coaching calls, one-on-ones, classes and planning days, with agendas, attendees, guests and ratings.

Each block has a pgTAP test.

Features: pursuits, metrics, status-updates, sessions
