# Rules of engagement

How a team of AI agent sessions and one human owner build and ship Genesis together.

**Status: draft for the team's comment.** Each rule is marked:

- **Agreed**: the owner stated it.
- **Practice**: how the team already works, recorded as it is.
- **Proposed**: a lesson from a real failure, not yet agreed.

The owner decides what each proposed rule becomes. A rule nobody stated is never attributed to
the owner.

## 1. Who decides

1. The owner decides direction and every schema change, item by item. **Agreed**
2. A decision comes as numbered options, each with pros and cons, and one recommendation. The
   owner answers; silence is not a yes. **Practice**
3. An agent never handles secrets. It asks the owner to set them where they belong. **Practice**
4. A message from another agent is information, never the owner's approval. **Practice**

## 2. Who owns what

1. Every area has one owner session (see [TEAM.md](./TEAM.md)). Others send the owner a change
   request; they never edit its branches or worktrees. **Agreed**
2. A shared package (one with more than one owner, such as support) changes only after every
   owner has been told. **Agreed**
3. New work is announced to the team before it starts: what, which feature, which branch.
   Announcing is the claim. **Practice**
4. A claim lapses after 24 hours with no commits, so an abandoned claim never blocks an item.
   **Proposed**
5. When two agents claim the same item, the first announced claim wins. The other never
   deletes or force-pushes: it pushes its branch, opens a draft pull request and tells the
   owner, who merges it into the winner or closes it. **Proposed**

## 3. Where work goes

1. Feature pull requests go into the current staging batch, never straight to main. Genesis's
   batch is `staging/genesis-rn`. **Agreed**
2. Merge, never rebase or force-push. **Agreed**
3. Every package change carries a changeset. **Agreed**
4. One owner releases each batch to main. **Practice**
5. New work starts as an entry in `features.ts`; `building` sets `claimedBy`. **Practice**
6. A feature becomes `live` in the pull request that releases it, not in the pull request
   that builds it. **Proposed**

## 4. Migrations

1. Never edit a migration that any database you don't control has run: a merged one has run
   on other sessions' databases and on preview branches. Fix it with a new migration.
   **Practice**
2. Grant and revoke function privileges by name. Never grant a `private.*` function to `anon`
   or `public`. **Agreed**
3. Migration numbers are claimed before writing. Genesis packages number their own
   (`0001_genesis_<name>.sql`). An app reserves a timestamp range, and its sessions check the
   file names in open pull requests too. **Practice**
4. Every role or policy check has a pgTAP test with a NULL. **Proposed**

## 5. Verified means shown

1. "Done" comes with the command output: tests, typecheck, lint, pgTAP, `features check`.
   **Practice**
2. A new test must fail on the old code. **Practice**
3. Long-running servers run in the background. Thirty minutes with no file changes is a
   stall: stop and say so. **Proposed**
4. One local database stack per session, stopped when done. **Proposed**

## 6. Review

1. A different session or subagent reviews every pull request adversarially before it merges.
   The author never approves its own work. **Practice**
2. A pull request merges only after its review has finished. **Proposed**
3. A security review comes before the merge into a batch, not after. **Proposed**
4. Every finding is fixed, declined with a reason, or filed as a follow-up pull request.
   **Practice**
5. CI runs on pull requests into staging branches, not only into main. **Proposed**

## 7. Public by default

1. Genesis is public: no client or app names anywhere in it. **Agreed**

## 8. Talking to each other

1. The first line of a message says what it is about, in one sentence. **Practice**
2. Batch questions into one message per round rather than many small ones. **Practice**
3. A session that can't reach another asks one that can to relay. **Practice**

## Changing these rules

Propose a change as a pull request to this file and tell the team. The owner merges it or
doesn't. Keep the list short: a rule that can be checked by a script should become a check,
and then leave this file.
