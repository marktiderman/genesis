# Collaboration and sharing (proposal)

Status: proposal, feature `collaboration` (idea). Nothing here is built yet. Decisions still
open are listed at the end.

## The problem

Apps keep rebuilding the same pieces wherever more than one person works on one thing:

- who something is shared with, and what each person may do with it;
- what participants see of each other's work, and when they see it ("answer first, then see the
  group's");
- a place to talk about it;
- a way to bring answers together (average, spread, side by side).

Each copy has its own options, words and rules. A person learns a new sharing model on every
screen, and every copy needs its own access checks and tests.

The goal is one model, applied the same way to anything an app shares: a form, a worksheet, a
lesson, a document, a meeting's agenda. It should feel like a Google Docs share box: the same
dialog and the same words everywhere, with room for a type to add its own options.

## One model: a space

A **space** is the one place where some people work on something together. A group's run of one
assignment is a space. So is a cohort's run of a lesson, a workshop, a three-week feedback round
and a one-on-one.

A space has five parts.

| Part | What it says | Examples |
| --- | --- | --- |
| **Subject** | The item being worked on: a reference `(kind, id)`, owned by the app. | a worksheet, a lesson, a form, a document |
| **Audience** | Who is in it: people, groups, the whole tenant, or anyone with the link. | one client, a cohort, a team, the company |
| **Roles** | What each person may do. | owner, facilitator, participant, viewer |
| **Visibility** | What participants see of each other's contributions, and when. | nothing; who's done; totals; names and totals; full answers |
| **Timing** | When the space runs. | ongoing; a window (three weeks); a live session; repeating by period |

**Contributions** are what participants add inside a space: an answer, a post, an idea, a vote,
a reaction. Each one is a reference `(kind, id)` to the app's own row, with an author, a period
and a `private` flag. The package never stores the answers themselves.

### Roles

| Role | Can |
| --- | --- |
| Owner | change the audience, the roles and the policy; close or reopen the space |
| Facilitator | run it: reveal, lock, nudge, see every contribution that isn't private, export |
| Participant | contribute; sees others' work only as the visibility policy allows |
| Viewer | read what the policy shows, without contributing (an observer, a sponsor) |

Apps may rename the roles in their own words. They may not add hidden powers, so every check
stays in one function.

### Visibility: what and when

**What** participants see of each other, least to most:

1. **Nothing.** Each person sees only their own work.
2. **Who's done.** Names of those who have contributed, without their content.
3. **Totals.** How many have contributed, and combined results with no names.
4. **Totals with names.** How many each person has contributed.
5. **Full.** Everyone's contributions, side by side.

**When** they see it:

- **Always.** They can see others' answers before writing their own.
- **After I contribute.** The default. You answer first, then see the group's.
- **After everyone, or at the deadline.** Nothing shows until all are in or the window closes.
- **When the facilitator reveals.** For a live meeting: everyone answers, then it all shows at
  once.

**Anonymous** (a flag): contents show without names, for honest team assessments and feedback
rounds. The facilitator still sees names unless the owner turns that off too.

**Private** (per contribution): the author keeps one contribution out of the shared view, at any
level. If they do that at "Full", they don't see the others' private contributions either. Fair
sharing works both ways.

### History

A space can let participants see the contributions of earlier runs of the same subject: "see
what past cohorts said". This is off by default. It respects each earlier contribution's own
`private` flag and that run's anonymity. It never reveals anything an earlier run kept hidden.

## What the package provides

### Data (`genesis_collab` schema, in the app's own Supabase)

- `spaces`: subject `(kind, id)`, tenant, policy (visibility, reveal, anonymous, history) and
  timing (opens, closes, period rule, live or async), plus who created it.
- `space_members`: a person, or a group the app resolves, with a role. Rows that come from a
  group follow that group's membership through the app's hook. The package doesn't copy members.
- `space_contributions`: kind, id, author, period, private, created, and revealed. These are
  pointers only.
- `space_events`: reveal, lock, reopen, change of policy. Who did it, and when.

Checks are SQL functions that every table and view uses:

- `private.collab_role(space, person)` returns the person's role.
- `private.collab_can_see(space, person, contribution)` returns whether they may see it.

The app calls them from its own row-level security on its own rows, for example
`answers ... using (collab_can_see(...))`. The rules live in one place, and the app's data stays
in the app's tables. Who belongs to a group and who is a tenant admin come from the app, through
the same hooks `tenant-features` uses.

Contract tests ship with it, run with `genesis_testing`: for every combination of visibility,
reveal and private, who sees what.

### Core (TypeScript, headless)

- `canSee(policy, viewer, contribution, state)`: the same rule as the SQL, for the interface.
  Tests check that both give the same answer.
- `gateOf(policy, me, state)`: what to show in place of others' work: `hidden`,
  `contribute_first`, `share_first`, `waiting_for_others`, `waiting_for_reveal` or `open`.
- `describePolicy(policy)`: a sentence anyone can read, such as "Everyone sees each other's
  answers after they've sent theirs." It's used in the dialog, on the item and in the
  participant's view.

### Interface (`genesis-ui`, web and native)

- **Share dialog, people tab.** It sits next to the existing link, QR and embed tabs:
  - who has access (people, groups, the tenant, a link) and their role;
  - "What people see of each other", with the five levels and a preview of the sentence above;
  - when it shows, anonymous, and history.
  A type can add its own section, such as a worksheet's "Saves to" or a form's prefill. It's one
  dialog everywhere.
- **Reveal gate.** It wraps "the group's work" and shows the right state, such as "Send yours to
  see the group's", "4 of 7 have answered" or "Waiting for the facilitator". It shows the content
  once the gate opens.
- **Roster.** Who's in, who's done, and nudge. Facilitators see names. Participants see what the
  policy shows.
- **Live controls**, for a facilitator in a meeting: open, lock, reveal, next. Realtime is a
  hint (a Supabase channel that invalidates queries). The data is never carried over the
  channel.

### Talking about it: chat, not a new message store

A space's discussion is a `genesis-chat` conversation of the app's kind `space`. Each subject is
a topic: a lesson's parts, or a meeting's agenda items. Members come from the space. So do
threads, reactions, mentions, read state and push.

- A **discussion board** is a chat view: topics as cards, newest activity first.
- An **ideas board** is the same with votes: a contribution kind with one vote per person. Reuse
  the idea-board shape from `feature-voting`.
- **Comments on a record**, such as a coach on one answer or staff on a response, are a short
  thread on that record. It's the `CommentThread` pattern, presentational, in genesis-ui, with
  data from chat or from the app's own comment table.

### Bringing answers together: `genesis-forms-studio`

The **compare view** takes N responses to one form definition and shows per question:

- average and spread for scales, with the existing `ScaleSummary`;
- counts for choices;
- side by side for text, lists and tables.

It can also show subject versus self, or manager versus report, as two columns.

It belongs in forms-studio because it's about form answers. It reads the space's policy through
`canSee` and `gateOf`, so it shows only what it may.

## Mapping the cases

| Case | Audience | Visibility (what, when) | Timing | Views |
| --- | --- | --- | --- | --- |
| One client, one worksheet | one person, their coach as facilitator | Nothing | once or repeating | coach comments |
| A cohort's lesson | the cohort | Full, after I contribute | the lesson's window | discussion by lesson part, compare |
| Live workshop or meeting | the attendees | Full or Totals, when the facilitator reveals | live | live controls, compare, ideas |
| Team assessment | the team | Totals, anonymous, after everyone | a window | compare (average and spread) |
| Manager and report one-on-one | two people | Full, after everyone | per quarter | compare in two columns |
| Company feedback round | the whole tenant | Totals or Full, always | three weeks | ideas board, discussion |
| Course, async, past takers | this run, plus history | Full, after I contribute, history on | ongoing | compare, discussion |

## Assessments: who answers and who it's about

Answering and being the subject can be different people. In a manager's review of a report, the
manager answers and the report is the subject. A contribution may name a `subject` person, which
by default is the author. Compare views can then put "about Sam, by Sam" next to "about Sam, by
Riley".

## What stays in the app

- The subjects themselves: forms, worksheets, lessons and their content.
- The contributions' own rows: answers, posts and their columns.
- Group and membership tables, and tenant roles, through hooks.
- When a space opens and repeats: the app's scheduling, for example a roadmap that runs a check
  every quarter. The package takes the opens, closes and period it's given.
- The words: role names and level names may be renamed per app. The meanings may not change.

## Moving existing apps onto it

An app that already has a ladder of five group-sharing levels, a "send yours first" gate and a
per-answer private flag maps onto this one for one: same levels, same gate, same flag. The move
is:

1. Create a space for each existing group assignment, with its level copied into the policy.
2. Have the app's row-level security call `collab_can_see`.
3. Swap the app's own dialog section for the shared people tab.

Answers don't move.

## Build order

1. Model, SQL checks and contract tests. Core `canSee`, `gateOf` and `describePolicy`. No
   interface yet.
2. The share dialog's people tab, the reveal gate and the roster.
3. The compare view in forms-studio.
4. Space conversations on chat: the discussion board, then the ideas board.
5. Live controls.
6. History across runs.

## Open decisions

1. **Default reveal** for a new group space: after I contribute (proposed) or after everyone.
2. **Anonymous by default** for assessments: proposed yes, with the facilitator still seeing
   names.
3. **Viewer role**: keep it, for an observer or sponsor, or drop it to start with fewer roles.
4. **Package name**: `genesis-collab` (proposed), or put it under `genesis-supabase` and
   `genesis-ui`.
5. **History**: off by default (proposed), and whether earlier runs show names at all.
