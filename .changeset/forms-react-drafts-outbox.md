---
"@marktiderman/genesis-forms-react": minor
---

`useFormDraft(definition, { store, respondent, version?, delayMs?, ... })`: `useForm` with a draft
on the device, put back when the form opens (at the question reached), saved as the respondent
goes and flushed when the page is hidden or the component unmounts; `clear()` once the submission
is queued. `useSubmitOutbox(outbox)`: the outbox's state (pending, failed, items, online), started
on mount and following the browser's online and offline events. `outboxSubmit(outbox, { formId,
clearDraft })`: an `onSubmit` for `useFormController` that queues the submission and then clears
the draft (a storage failure leaves the controller `failed`, answers kept). It now needs genesis-forms
`>=0.7.0`.

Features: forms-drafts, forms-outbox
