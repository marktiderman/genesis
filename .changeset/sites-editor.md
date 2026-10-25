---
"@marktiderman/genesis-sites": minor
---

Add the visual editor, `@marktiderman/genesis-sites/editor`: `<SiteEditor siteId store brand forms? assets? onPublish? />`.

- The Puck config is generated from the section registry: fields from each section's JSON Schema (text, textarea, rich text, links, the image picker, selects for variants and enums, lists, slots), one Add-picker entry per preset grouped by category, and each section's `limit` enforced in the picker.
- The canvas is an iframe drawn by the sections' own renderers with the site stylesheet and the brand's theme; Preview runs the real `/web` request handler in a sandboxed frame.
- Pages panel: open, add (blank, the landing page from the brand, the starter site's pages), change an address (a 301 is written; reserved paths are refused), delete, and the header menu. Reordering uses the store's optional `reorderPages`.
- Autosave by compare-and-swap (`Autosaver`): edits made during a save or a conflict are kept; a conflict offers loading the other version or keeping yours. Undo and redo come from Puck's history.
- Publish panel: the publish checks (errors block), preview, publish with a note, release history and rollback, and per-page SEO (title, description, share image, noindex).
- Image picker over the store's `putAsset` (or the host's upload), with alt text required unless the image is decorative.
- Styled with Genesis UI through Puck's overrides. Puck (`@puckeditor/core` ^0.23) is an optional peer dependency: install it where the editor runs. Apps import everything from `/editor`; the root, `/web` and `/sections` never load it.
