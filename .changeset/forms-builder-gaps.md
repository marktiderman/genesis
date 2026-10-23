---
"@marktiderman/genesis-forms-builder": minor
---

Builder fixes for new forms and hosts with their own tabs, and settings for the new question types.

- **Empty form:** shows a neutral "Add a question" instead of a red "1 to fix"; the empty-form finding is listed as information. Publishing is still blocked until the form asks something.
- **New questions:** a question added from the Add menu opens untitled, with its title field focused and the placeholder "Your question". Its "needs a title" check waits until the author leaves the field, or until the new `FormBuilderHandle.revealChecks()` (call it when someone tries to publish); the status reads "In progress" meanwhile. `createField()` keeps titling a field after its type unless you pass `label: ""`.
- **Hosting the panels:** `tabs={false}` hides the builder's tab bar; `tab` and `onTabChange` let a host control the panel (also from its own row of tabs); `settingsExtra` renders the host's settings under the form settings. Logic and Endings are one panel, "Logic and endings" (`LogicAndEndingsPanel`); `"endings"` is still accepted as a `BuilderTab`.
- **New types:** dropdown, number, date and consent are in the default palette, with settings: options (and switching between single choice, multiple choice and dropdown keeps them), smallest/largest/step, earliest/latest date, the consent checkbox's text. Ratings get end labels and a Numbers/Stars choice; NPS gets end labels. Logic compares numbers and dates with the right input.
- `theme` and `submitLabel` pass through to the preview. `Finding.code` (`"no-questions"`, `"untitled-question"`) names the builder's own checks; `visibleFindings`, `ChecksContext` and `useChecks` are exported for panels hosted on their own.
- `diffDefinitions` reports a change to end labels, the star display or the consent text as wording, not as a settings change.

**Behaviour change:** a question with no title is now an error that blocks publishing (it was a warning), since new questions start untitled. The message is "Question N needs a title."

Features: forms-builder
