---
"@marktiderman/genesis-forms-builder": minor
---

`FormBuilder` takes `readOnly` for people who may read a form but not change it. Every panel (Questions, Logic, Endings, Settings, JSON) stays visible and questions and rules still open, but their controls are disabled, add/remove/reorder/duplicate/drag are hidden, undo/redo give way to a "Read only" badge, and `onChange` is never called. A host's field-type `Panel` and `ConditionValue` receive a new optional `readOnly` prop, and `BuilderConfig` gains `readOnly` for panels rendered on their own. Additive: the builder behaves as before without the prop.
