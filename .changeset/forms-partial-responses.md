---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-web": minor
"@marktiderman/genesis-forms-builder": minor
"@marktiderman/genesis-forms-studio": minor
---

Partial responses and drop-off by question (Typeform's "capture partial responses after every question").

- **genesis-forms**: `settings.saveProgress` (off by default; `parseForm` checks it's a boolean). `formProgress(engine)` says how far a respondent got: `{ step, total, fieldId }`, `fieldId` being the furthest question reached, kept after Back; `furthestReached(state, definition)` is the block. `FormState.furthest` holds the furthest block reached with Next. `createForm(definition, { initialValues, resumeAt })` picks up where someone was after a reload: it moves on with Next from the first block to `resumeAt` (so Back still walks their path), stopping early at a step that no longer passes.
- **genesis-forms-web**: `<Form onProgress={(engine, progress) => …}>`. With `settings.saveProgress` on, it's called a moment after each step forward (`PROGRESS_DELAY_MS`; in classic layout `CLASSIC_PROGRESS_DELAY_MS` after the answers change), never holding up Next: a rejection is ignored, a pending call goes at once on `pagehide`, and none is made once the form is submitted. A short note under the first question says "Your answers save as you go." (`progressNotice`, `null` hides it).
- **genesis-forms-builder**: a "Save answers as they go" switch in the form's settings, under Responses (`settingsOmit: ["saveProgress"]` leaves it out). `updateSettings` stores `saveProgress` only when on.
- **genesis-forms-studio**: `SummaryItem.status` (`in_progress`, `partial`, `completed`; missing is completed) and `furthest`. A status filter (`ResponseFilter.status`, `FiltersValue.status`, `<ResponsesFilters statuses>`: Sent and partial by default, Sent, Partial, In progress), so in-progress responses stay out of summaries unless picked; `matchesStatus`, `STATUS_FILTER_LABEL`, `RESPONSE_STATUS_LABEL`. The Responses card says how many are partial. `dropOffByQuestion(items, definitions)` and `<DropOffByQuestion>`: each question's views, how many stopped there, and the drop-off share.
