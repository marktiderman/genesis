# @marktiderman/genesis-collab

Collaboration and sharing for anything more than one person works on: a group's run of a
worksheet, a cohort's lesson, a workshop, a team assessment, a feedback round. The design is
[`docs/COLLABORATION.md`](../../docs/COLLABORATION.md).

A **space** has a subject (your record), an audience (people, or groups your app lists), roles
(owner, facilitator, participant, viewer), a policy (what participants see of each other, and
when) and timing. **Contributions** are pointers to your own rows, so your answers and posts stay
in your tables and this package decides who reads them.

## What's here

- `migrations/0001_genesis_collab.sql`: the `genesis_collab` schema and its rules, for your
  Supabase. Register your audiences and subject types, then call `genesis_collab.can_see(id)`
  from your own row level security. It only narrows what your own rules allow.
- `migrations/tests/0001_genesis_collab.test.sql`: the pgTAP contract (who sees what, for every
  level, reveal rule, private flag and role).
- The core (`import { gateOf, canSee, mayAggregate, showsNames, describePolicy } from
  "@marktiderman/genesis-collab"`): the same rules for the interface, pure.

## The policy

| Setting | Values |
| --- | --- |
| `visibility` | `hidden`, `whos_done`, `totals`, `totals_with_names`, `full` |
| `reveal` | `always`, `after_me`, `after_all` (or the deadline), `on_reveal` |
| `anonymous` | contents without names; facilitators still see them |
| `min_group` | combined and anonymous results need at least this many others (never fewer than 3) |

Each contribution can be `private`: only its author reads it. At `full`, someone whose own is
private doesn't see the others' until they share theirs. Owners and facilitators see every sent
contribution that isn't private.

```ts
import { describePolicy, gateOf } from "@marktiderman/genesis-collab";

describePolicy({ visibility: "full", reveal: "after_me", anonymous: false, minGroup: 3 });
// "Members see each other's answers once they've sent their own."
```

Not yet: the share dialog's people tab, the reveal gate and roster components, discussions on
genesis-chat, the compare view in genesis-forms-studio, and live controls.
