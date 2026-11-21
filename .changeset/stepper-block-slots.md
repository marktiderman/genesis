---
"@marktiderman/genesis-ui": patch
---

Stepper: a step's label and description render in blocks, not paragraphs, so they can hold block content such as a `Progress` under each step (before, a `Progress` there nested a `<div>` inside a `<p>`). Web only: NativeStepper still takes strings. Progress is announced as a `progressbar` with `aria-valuemin`, `aria-valuemax` and its clamped `aria-valuenow` (a value that isn't a number counts as 0), named "N% complete" unless you pass `aria-label`.
