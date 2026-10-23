---
"@marktiderman/genesis-forms-web": minor
---

Renderers for the new question types, a theme, a required note and one send word.

- Renders `dropdown` (a native select, so phones show their own picker), `number` (the decimal or numeric keypad, keeps what is typed until it is a number, shows its range), `date` (the browser's date picker with `min`/`max`) and `consent` (one checkbox under the question).
- Ratings show `lowLabel` / `highLabel` under their ends, each read with its end option, and `display: "stars"` draws a row of stars (still one radio per star, "3 of 5"). NPS takes the same labels and keeps "Not likely" / "Very likely" as defaults.
- `theme={{ accent, headerImage, headerImageAlt }}` (new `FormTheme` type): the accent becomes the form's primary colour, adjusted only as far as needed for at least 3:1 against the page (light and dark) and 4.5:1 for text on it; `headerImage` is a banner over the title. `themeColors` and `themeCss` are exported.
- When any question is required, the title shows "\* Required" (`requiredLabel`, `null` hides it; `HeaderSlotProps.requiredNote` and `image` for a custom header).

**Behaviour change:** the default `submitLabel` is now **"Send"** in every layout (it was "Submit"). Pass `submitLabel="Submit"` to keep the old word.

Features: forms-web
