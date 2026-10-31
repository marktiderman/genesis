---
name: work-tracking
description: Work a card on the maintainers' work board with the `work` CLI: read your inbox, take the next card, note progress, ask for a test, close it from the PR, then the resolution and debrief. Use when you start, block on, open a PR for, or finish a piece of work in this repo.
---

# Work a card

The maintainers track work on a private product hub: initiatives hold projects, projects hold
tasks, decisions and bugs, each with an id. You read and update it with `work`, the private
product-hub CLI, which runs from any directory; setup (putting `work` on your `PATH`, the agent
login) is in the private runbook. `work help` lists every command.

Every write names you: `--as <your session name>`, or set the CLI's agent-name variable once.

## The one way to work a card

1. **Inbox first.** `work inbox --mine`: mentions, questions for you, what others did on your
   items. Act on it before anything new (answer a question with `work answer <id> "…"`).
2. **Take a card.** `work next --take` starts the next one for you (yours first, then bugs, then
   the oldest); `work next --product <slug> --take` to stay in one product (`work products` lists
   them). No card fits? `work create --parent <id> "what you're doing" --done-when "…"`, then
   `work start <id>`. `start` won't take a card without a done-when: add one with
   `work edit <id> --done-when "what is true when it's done, and how to check"`.
3. **Read before building.** `work show <id>`: the card, its done-when, links and history.
4. **Notes as you go.** `work note <id> "what changed, what you decided and why"`, one per
   meaningful step. Blocked: `work block <id> "what you need, from whom"`, then pick up something
   else. Need an answer: `work ask <id> <Name> "question"` (your card waits on it).
5. **A screen change? Ask for a test** before calling it done: `work ask <id> <tester> "test: <what
   changed>, <where to look>, <what should happen>"`. Changes with no screen skip this.
6. **The PR** names the card and closes it: `Closes <ID>` in the body, and nothing else about it.
   This repo is public: never write what the card is, or which app it's for, in a commit, PR or
   comment. The card is marked done when the PR merges.
7. **Done, with the resolution.** `work done <id> "what happened against the done-when, with the
   evidence (the PR, the check's output)"`. Stopping early: `work drop <id> "why"`.
8. **Debrief, right after.** `work debrief <id> --well "…" --didnt "…" --change "…"|none --friction "…"|none`.
   `start` refuses new work while you owe one.
9. **Stay awake to your mail.** Run `work watch` in the background: it exits when your inbox has
   something, which wakes you. `work follow <id>` or `work follow <PR URL>` to hear about more.

## Rules

- One card per piece of work; don't mark done what isn't merged.
- Notes are read by the maintainers: plain words, no secrets.
- If `work` isn't found, says it can't sign in, or can't find a card, the setup isn't done: say so,
  don't work around it.
