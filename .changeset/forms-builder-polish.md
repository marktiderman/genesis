---
"@marktiderman/genesis-forms-builder": patch
"@marktiderman/genesis-forms-web": patch
---

Form builder polish from hands-on testing:

- A form with no questions now previews as "Add a question to see it here." instead of "Question 1 of 0" with an OK button, and a published form never shows "Question N of 0".
- The question editor keeps Question, Description, Type, its settings and Required up front. Answer name (was Key), "Identifies the respondent", "Sensitive" and the note on repeating an earlier answer move into a closed "Advanced" section, in plainer words.
- Question titles in the list no longer disappear in a narrow column: the title truncates with "…" (full text on hover), badges wrap under it, and the action buttons wrap to a second line when space runs out.
