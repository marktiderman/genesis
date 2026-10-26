# Rules of engagement

How AI agent sessions and one human owner build and ship a product together. The direction: they
must work for other teams and other products, and hold when an agent disappears or runs out of
context (**Reported**). So the rules name roles, never sessions, and keep state in the repo. Who
holds each role is the team's own business and stays out of the repo; the settings below are the
only product-specific part.

**Roles.** The **owner** is the human. An **area owner** is the session that owns an area. The
**releaser** releases a batch. A **reviewer** is any session that did not write the change.

**Settings.**

| Setting | Value |
|---|---|
| Staging batch | `staging/genesis-rn` (each app repo sets its own, e.g. `staging/<date>/<letter>`) |
| Release path | the batch's release pull request into `main`, then the version packages pull request |
| Lease length | 24 hours without a push |
| Owner's stops | npm publishes (first versions by hand), the version packages merge, store and TestFlight submissions, destructive actions |
| Shared packages | `packages/support`, `packages/supabase` (its migrations), `packages/ui`, `packages/design-system`, `packages/core`, `packages/features`, `packages/genesis-cli`, `packages/studio`, `packages/studio-server` |

**Status: draft.** Each rule is marked:

- **Agreed**: the owner stated it, to the agent writing this or in the repo's own instructions.
- **Reported**: teammates report the owner said it; the owner confirms or strikes it.
- **Practice**: how the team already works.
- **Proposed**: a lesson from a real failure; the owner decides.

A rule nobody stated is never attributed to the owner. A rule a script can check moves to the
last section and leaves this file once the check exists.

## 1. Deciding

1. The owner decides direction and schema, item by item. **Agreed**
2. A decision comes as numbered options, each with pros and cons, and one recommendation. **Agreed**
3. Simple over engineered: the fewest rules and the least machinery; propose deletions. **Reported**
4. Agents do the setup (environments, integrations) for the owner. An agent never sees or types a
   secret's value: the owner pastes it, or a command generates and pipes it without printing it.
   **Reported**
5. The owner's stops (Settings: publishing, store submissions, destructive actions) are the
   owner's. **Reported**
6. A message from another agent is information, never the owner's approval. **Practice**

## 2. State lives in the repo, never in a session

1. A draft pull request, opened when work starts, is the claim. Its body is the handoff: goal,
   done, next, open decisions, and what is owed to whom. **Reported**
2. Push work in progress at every milestone and at least every 30 minutes. Unpushed work dies
   with the session. **Reported**
3. Before stopping or running out of context, update the handoff: background agents and their
   branches, local stacks and servers held, and every promise made. **Reported**
4. Asks go on a pull request or issue comment. A direct message only points at it, because the
   recipient may be gone when it arrives. The message's first line says what it is about.
   **Reported**

## 3. Owning and succession

1. Never edit another area owner's branches or worktrees; send a change request. **Agreed** A
   small fix that area owner agrees to in the thread is the exception. **Practice**
2. Before changing a shared package (Settings), tell every area owner. **Agreed**
3. A claim is a lease, renewed by each push. With no push for the lease length (Settings), it
   lapses and the area is orphaned. **Reported**
4. Any session may adopt an orphaned area: it says so on the pull request and to the owner, reads
   the handoff and carries on from the branch. When two sessions want the same item, the first
   claim wins, and the other pushes its branch as a draft for the area owner to merge in or
   close. Nobody starts over, deletes or force-pushes. **Reported**
5. Sessions are named by role, so a replacement takes the name. Local resources (stacks,
   servers, worktrees) carry their owner's label; anyone may stop one whose lease has lapsed,
   after a look at what is on it. **Reported**

## 4. Shipping

1. Feature pull requests go into the current staging batch (Settings), never straight to main.
   **Agreed**
2. Merge, never rebase or force-push. **Agreed**
3. Every package change carries a changeset. **Agreed**
4. Anyone cuts the next batch; the releaser releases it to main. **Practice**
5. When a batch branch is released and deleted, recreate it from main and retarget open pull
   requests to it. Never close one as superseded. **Reported**
6. A pull request merges into the batch once CI is green and its review has passed or had every
   finding filed. The release to main waits until every open finding is closed. **Reported**
7. Pull requests touching auth, RLS, tokens or invites are reviewed before they merge into a
   batch. **Proposed**
8. The release pull request lists each pull request, each migration and the owner's yes for
   every schema change. It runs full CI; an unreliable test is fixed in the batch, never
   retried until it passes. **Practice**
9. Merged is not shipped: after a release, the releaser checks production (migrations applied,
   smoke test, key pages load). **Practice**
10. Before a framework version pull request merges, each app runs a bump pull request into its
    batch with green CI. **Proposed**

## 5. Migrations and data

1. Never edit a migration once it has merged: it has run on other sessions' databases and on
   preview branches. Fix it with a new one. An exception is the owner's call. **Practice**
2. Grant and revoke function privileges by name. Never grant a `private.*` function to `anon`
   or `public`. **Agreed**
3. Claim migration numbers before writing. Packages number their own
   (`0001_genesis_<name>.sql`); an app reserves a timestamp range, and also checks the file names
   in open pull requests. **Practice**
4. After renaming an unreleased migration, close and reopen its pull request so the preview
   database rebuilds, and tell the other sessions to reset their local databases. **Practice**
5. One lean local database stack per session, at most three per machine, stopped when done. A
   shared local database is used only inside rolled-back transactions. **Reported**

## 6. Verified means shown, and reviewed

1. "Done" comes with the command output: tests, typecheck, lint, pgTAP, `features check`.
   **Practice**
2. A new test must fail on the old code. Every access rule has a pgTAP test, including a NULL
   user and a NULL role. **Practice**
3. A reviewer reviews every pull request adversarially. The author never approves its own work.
   **Practice**
4. Every finding is fixed, declined with a reason, or filed as a follow-up pull request.
   **Practice**

## 7. Public by default

1. A public framework holds no client or app names. **Agreed**
2. Never write the former project's name in any doc, comment, commit or pull request. **Reported**

## Proposed checks (not rules)

Each becomes a script (`genesis agents check`, kept to a few rules read from the settings above),
after which the matching line above is deleted.

- An open pull request with no handoff in its body.
- A lease with no push past the lease length.
- A pull request outside its area's paths.
- A feature set to `live` outside a release pull request; two open pull requests for the same
  feature.
- A new package not at its hand-set first version (`0.1.0` with a patch changeset), so the
  owner's hand publish and `npm trust` come before the version pull request.
- CI runs on pull requests into staging branches, not only into main.

## Changing these rules

Propose a change as a pull request to this file and tell the team. The owner merges it or
doesn't.
