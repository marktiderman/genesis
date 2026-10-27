---
"@marktiderman/genesis-core": minor
---

`ViewField.labels` gives an enum value its words (`{ draft: "In progress" }`). Columns carry them and form fields get resolved `options`. `view.valueLabel(field, value)` and `valueText(labels, value)` say a value in words. A label for a value the field doesn't have fails `defineView`.
