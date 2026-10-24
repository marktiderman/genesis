---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-react": minor
"@marktiderman/genesis-forms-web": patch
---

A content-type registry, merging partial responses, and a shared form controller.

- `genesis-forms`: every field and content kind is one registered definition that the engine,
  `parseForm`, validation, the server and snapshots read, instead of switches on type names. A
  field kind's manifest gains `checkProps` (its props schema), `choice: { multiple }` (its answer
  shape: a host's choice kind gets `optionsFrom`, filters, `prefill`, `other` and snapshots),
  `literal`, and `snapshot`/`fromSnapshot` for other kinds. `registerContentType`,
  `getContentType`, `listContentTypes` and `contentText` add content kinds; `ContentBlock` takes
  `props` and any registered `type`. Also `choiceKind`, `isChoiceField`, `isBuiltInFieldType`,
  `VALIDATOR_FAILED_MESSAGE` and the `PropsCheck` types. `registerFieldType` now refuses a
  built-in kind's name unless `{ replace: true }`, refuses a manifest without `value` or
  `operators`, and stores a frozen copy (`operators` reads as a fresh list); a choice kind
  without its own `validate` gets the built-in check for its shape. A validator that throws
  refuses the answer; a props check that throws is one `parseForm` issue; a throwing `literal`,
  `snapshot` or `fromSnapshot` is skipped. The registry's global key names its format
  (`field-types@2`), so an older copy of the package in the same process keeps its own registry.
  `choiceOptions`, `withHostOptions`, `answerSnapshots`, `answersFromSnapshots` and
  `validateSubmission` return exactly what they did (golden tests pin them). Two message
  changes: once a host registers a content kind, an unknown kind's issue lists it ("Must be
  heading, text or callout."); and a field whose type is an `Object.prototype` name
  (`toString`) no longer gets nonsense literal warnings.
- `genesis-forms`: `mergeResponses(definition, base, patch, { hidden?, hostOptions?, offPath? })`
  lays a patch over a saved draft for resuming and partial saves. Answers on a path no longer
  taken are dropped, unless `offPath: "keep"` (the default keeps them only with
  `settings.clearHiddenValues: false`). Also exported from `/server`.
- `genesis-forms-react`: `useFormController(engine, options)`, the headless controller for any
  renderer (step and path, errors, Next and Back, sending with retry, auto-advance, saving
  progress, announcements and focus targets), plus `formEngineOptions` and the
  `ADVANCE_DELAY_MS`, `PROGRESS_DELAY_MS` and `CLASSIC_PROGRESS_DELAY_MS` timings.
- `genesis-forms-web`: `<Form>` renders `useFormController`; its behaviour is unchanged. A content
  kind it has no drawing for shows its display text. It now needs genesis-forms-react `>=0.3.0`.
