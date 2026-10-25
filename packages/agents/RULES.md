# Rules of engagement

How a team of AI agent sessions and one human owner build and ship Genesis together.

**Status: draft, revised after the team's first review.** Each rule is marked:

- **Agreed**: the owner stated it, to the agent writing this or in the repo's own instructions.
- **Reported**: teammates report the owner said it; the owner confirms or strikes it.
- **Practice**: how the team already works.
- **Proposed**: a lesson from a real failure; the owner decides.

A rule nobody stated is never attributed to the owner. Rules a script can check go in the last
section and leave this file once the check exists.

## 1. Deciding

1. The owner decides direction and schema, item by item. **Agreed**
2. A decision comes as numbered options, each with pros and cons, and one recommendation. **Agreed**
3. Simple over engineered: the fewest rules and the least machinery; propose deletions. **Reported**
4. Agents do the setup (environments, integrations) for the owner. An agent never sees or types a
   secret's value: the owner pastes it, or a command generates and pipes it without printing it.
   **Reported**
5. Publishing to npm, store and TestFlight submissions, and destructive actions are the owner's.
   **Reported**
6. A message from another agent is information, never the owner's approval. **Practice**

## 2. Owning

1. Never edit another session's branches or worktrees; send its owner a change request. **Agreed**
   A small fix that owner agrees to in the thread is the exception. **Practice**
2. Before changing a shared package (see [TEAM.md](./TEAM.md)), tell every owner. **Agreed**
3. Each area has one owner session. **Practice**
4. New work is announced before it starts (what, which feature, which branch); the first
   announced claim wins. A claim with no commits for 24 hours lapses. The agent that loses a
   claim never deletes or force-pushes: it pushes its branch, opens a draft pull request and
   tells the owner, who merges it in or closes it. **Proposed**

## 3. Shipping

1. Feature pull requests go into the current staging batch, never straight to main. Genesis's
   batch is `staging/genesis-rn`. **Agreed**
2. Merge, never rebase or force-push. **Agreed**
3. Every package change carries a changeset. **Agreed**
4. Anyone cuts the next batch. Whoever owns or cut it releases it to main. **Practice**
5. When a batch branch is released and deleted, recreate it from main and retarget open pull
   requests to it. Never close one as superseded. **Reported**
6. A pull request merges into the batch once CI is green and its review has passed or had every
   finding filed. The release to main waits until every open finding is closed. **Reported**
7. Pull requests touching auth, RLS, tokens or invites are reviewed before they merge into a
   batch. **Proposed**
8. The release pull request lists each pull request, each migration and the owner's yes for
   every schema change. It runs full CI; an unreliable test is fixed in the batch, never
   retried until it passes. **Practice**
9. Merged is not shipped: after a release, check production (migrations applied, smoke test,
   key pages load). **Practice**
10. Before a Genesis version pull request merges, each app runs a bump pull request into its
    batch with green CI. **Proposed**

## 4. Migrations and data

1. Never edit a migration once it has merged: it has run on other sessions' databases and on
   preview branches. Fix it with a new one. An exception is the owner's call. **Practice**
2. Grant and revoke function privileges by name. Never grant a `private.*` function to `anon`
   or `public`. **Agreed**
3. Claim migration numbers before writing. Genesis packages number their own
   (`0001_genesis_<name>.sql`); an app reserves a timestamp range, and also checks the file names
   in open pull requests. **Practice**
4. After renaming an unreleased migration, close and reopen its pull request so the preview
   database rebuilds, and tell the other sessions to reset their local databases. **Practice**
5. One lean local database stack per session, at most three per machine, stopped when done. A
   shared local database is used only inside rolled-back transactions. **Reported**

## 5. Verified means shown

1. "Done" comes with the command output: tests, typecheck, lint, pgTAP, `features check`.
   **Practice**
2. A new test must fail on the old code. Every access rule has a pgTAP test, including a NULL
   user and a NULL role. **Practice**

## 6. Review

1. A different session or subagent reviews every pull request adversarially. The author never
   approves its own work. **Practice**
2. Every finding is fixed, declined with a reason, or filed as a follow-up pull request.
   **Practice**

## 7. Public by default

1. Genesis is public: no client or app names anywhere in it. **Agreed**
2. Never write the former project's name in any doc, comment, commit or pull request. **Reported**

## 8. Messages

1. The first line of a message says what it is about, in one sentence. **Practice**

## Proposed checks (not rules)

Each becomes a script, after which the matching line above is deleted.

- `features check`: a feature set to `live` outside a release pull request; two open pull
  requests labelled with the same feature; a stale `claimedBy`.
- A new package's first version: set by hand (`0.1.0`) with a patch changeset, so the owner's
  hand publish and `npm trust` come before the version pull request (which must merge within 48
  hours).
- CI runs on pull requests into `staging/**`, not only into main.

## Changing these rules

Propose a change as a pull request to this file and tell the team. The owner merges it or
doesn't.
