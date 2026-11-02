---
"@marktiderman/genesis-ui": minor
---

Lists and forms on a phone:
- **Phone default for lists (opt-in).** `ResourceViewDefaultsProvider phoneMode="grid"` (or `"list"`) makes every `ResourceView` open in cards (or rows) on a phone and as a table on a desktop, unless its screen sets a mode. Without the provider nothing changes. `ResourceView`'s `mode` also takes `{ mobile, desktop }`. Calendar is never a phone default.
- **Keyboards and autofill.** Form inputs get the keyboard and autofill their type asks for (`email`, `tel`, `url`, and the decimal keypad for numbers), or the field's own `autoComplete`, `inputMode` and `enterKeyHint`. A new `tel` type renders `type="tel"`, and a `ResourceView` text field named like a phone number (`phone`, `mobile`, `work_tel`) is a `tel` field.
- **List search.** The search box is named for screen readers, shows a search keyboard with a Search key, offers no autofill, and its clear button is a bigger target.
- **Table cells.** A cell clips what it draws at its column's edge, so a long link or email no longer runs over the next column on a narrow table.
