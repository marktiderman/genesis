---
"@marktiderman/genesis-sites": patch
---

A redirect can't start on one of the app's reserved paths: `save_site_draft` and `publish_site` refuse one (any case, with a query string or not), and `isReservedPath` compares case-insensitively. The README says to pass `reserved` to `handleSiteRequest` (anon can't read `reserved_paths()`) and that a public assets bucket needs random file names.
A host that reserves `/` reserves the root page only, in the database as in `isReservedPath`.
