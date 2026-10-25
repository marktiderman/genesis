---
"@marktiderman/genesis-sites": patch
---

Review fixes for the V1 sections.

- Preview needs a signed-in viewer: `handleSiteRequest` takes `viewer` (the viewer's user id) and, in preview without one, answers null before reading any draft, page or post. Drafts are never read as anon.
- A failed read of the published posts no longer breaks the live page: the list renders empty (and logs), and a post that can't be read is not found.
- The timetable tells class types apart without colour: each chip names its type in text, the legend lists every type the shown days use (described or not), and the outline tone is dashed where plain is solid. An unnumbered timeline marker shows a dot.
- The contrast check adds a 3:1 warning for the brand's primary colour as a border or marker on the page.
- `import_posts` publishes a post only when it asks for `published`; with no status it comes in as a draft.
- `importAssets` names a file "file" when its URL has a malformed escape, instead of failing it.
- An absolute logo link gets `rel="noopener noreferrer"`; pricing group and plan headings derive from the section's level.
