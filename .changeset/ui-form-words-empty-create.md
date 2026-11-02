---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-core": minor
---

Forms: custom words, an empty-state create button, and keyboard focus that lands somewhere useful.

New, and changing nothing unless used:

- `ResourceForm` takes `submitLabel` (the submit button's words, over "Create" / "Save") and `description` (read out with the title, over the catalogue's `form.createDescription` / `form.editDescription`).
- `ResourcePage` `formTitles` also takes `createSubmit`, `editSubmit`, `createDescription` and `editDescription`, and a view's `copy.form` takes the same four (genesis-core `ViewCopy`); `ResourceView` merges the screen's over the view's, per entry, as it does the titles.
- `ResourcePage` `emptyCreate` (opt-in): an empty list that nothing filters shows its create button in the empty state instead of the header, and leaves out the search and sort row. Any search, status or filter, or `emptyFiltered` (the screen narrows the list itself, say with a tab), keeps the button in the header and the filter row. An `emptyState` action still wins.
- `ResourcePage` `createdToast` (opt-in): after the built-in form creates a row, a "Created {name}" toast with an Open action that opens it as a row click would, with focus moved to Open; Tab, Escape or the toast closing returns focus to New. Needs a mounted `<Toaster />`. New catalogue words: `form.created`, `form.createdUnnamed`.

Fixes, on by default:

- Closing a `ResourceForm` dialog or sheet (Cancel, Escape or a save) hands focus back to what had it when the form opened, usually the host's New or Edit button. It fell to the page body before, because the form opens from the host's own button rather than a Radix trigger, so a keyboard user started again from the top of the page.
- A `ResourceForm` dialog or sheet resets to its defaults before its fields mount (a page form is drawn with its fields at once, on the server too). The form stays mounted while closed and, with `shouldUnregister`, its values start empty, so with some react-hook-form versions a field registering corrected the dirty state during render and React logged "Cannot update a component while rendering a different component". The reset runs in a layout effect, before paint, and nothing typed is lost (no field is registered yet).
