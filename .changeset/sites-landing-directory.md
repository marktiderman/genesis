---
"@marktiderman/genesis-sites": minor
---

Landing pages get their own place in the site editor, on the same builder. The Pages tab has a
Landing pages section listing the site's `landing` pages (address, Published or Draft), with
**New landing page** (a title and an address; the landing page from the brand at
`<directory>/<address>`, opened in the same canvas, not added to the menu), a new address within
the directory (the old one redirects) and delete. The directory is a new optional site setting,
`SiteDoc.landing.directory` (default `/go`, `DEFAULT_LANDING_DIRECTORY`); changing it offers to
move the landing pages under the old one, with redirects. Landing pages are edited, checked,
previewed and published like any page, in the same release.

New in the root: `DEFAULT_LANDING_DIRECTORY`, `LANDING_SLUG`, `landingDirectory`, `landingPath`,
`landingSlugOf`, `landingSlugProblems`, `landingDirectoryProblems`, `landingPages`,
`landingMoves`. New in `/editor`: `createLandingPage`, `moveLandingPage`, `setLandingDirectory`,
and `movePageInList` takes `{ within }` to reorder a subset of the pages. The Pages list and the
menu editor's suggestions now leave landing pages out. No database change: each landing page's
path is checked by the existing page functions.
