---
name: see-it
description: Let a reviewer see and try a change before it merges, as a private page built from the PR's own packages. Use when a PR (or a release PR) changes anything a person sees or touches, when you say work is ready, or when a design question is easier to show than to describe.
---

# See it

A change someone can see is easier to review. When your work is ready and it changes what a person
sees or does, give the reviewer a page they can open and try, built from your branch's real
packages, and put the link in the PR as **See it**.

Nobody hosts or pays for anything. The page is an Artifact (the Artifact tool) and is private
until its owner shares it. It's built on demand, when you say something is ready, not on every
push.

## What we've learned so far

These are notes, not steps. Try things, and add what you learn here.

- **Build it from the branch.** Import the packages as an app would (`@marktiderman/genesis-ui/data`,
  `/provider`, …), with sample data from `GenesisProvider`'s `mock` datasets or a memory client
  (the chat dock used `createMemoryChatClient`). Then the reviewer is trying the code that ships, not a
  drawing of it.
- **Try it yourself first.** Drive it with Playwright (Chromium is pre-installed), screenshot it at
  a phone's width as well, and watch the console. Each of the first three previews turned up
  something that reading the diff missed.
- **Say what to try.** A few lines on the page: what changed, what to click, what should happen.
- **Ask on the page.** If a design choice is open, show both options and ask the question there. A
  reviewer's comment on an Artifact reaches the session that published it.
- **Pick the form that fits.** A clickable demo, a before and after, an explainer for back-end work
  that has nothing to click (don't fake a screen), or a short recording from a simulator for
  native motion. Something new is welcome: say what you tried and whether it helped.
- **Keep it out of the repo.** Build from a scratch folder and move it out when you've published.
  Only this skill is committed.

## One way to build one

`vite.see-it.config.ts` here bundles a folder into static files. `starter/` is the board preview
from #670: an `index.html`, a `styles.css` that pulls in the Genesis theme and Tailwind, and a
`main.tsx`.

1. Run `pnpm build:packages` on your branch.
2. Copy the config into `apps/sample`, and a demo folder to `apps/sample/see-it-<name>`.
3. From `apps/sample`, build:
   `SEE_IT=see-it-<name> ../../node_modules/.bin/vite build -c vite.see-it.config.ts`.
4. Publish `apps/sample/see-it-<name>-dist` with the Artifact tool:
   - write a small page holding a `<title>`, a body background, the built `<link>` and `<script>`;
   - pass `root` set to that folder and `files` mapping `assets/*`.
5. Delete the copied config, the demo folder and the dist folder.

Better tooling is welcome: a script, a gallery of previews, a page that shows a PR's previews
side by side. Propose it the same way.

## In the PR

```
**See it:** <link> (built from <branch> at <sha>)
Try: <two or three things>. Found: <what trying it turned up, or "nothing">.
```
