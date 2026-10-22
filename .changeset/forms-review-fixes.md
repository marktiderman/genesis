---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-react": patch
"@marktiderman/genesis-forms-web": patch
"@marktiderman/genesis-forms-devtools": patch
---

Review fixes for the forms packages.

- `genesis-forms`: hidden inputs take `identifying: true` (`f.hidden.string({ identifying: true })`); on an anonymous form `validateSubmission` leaves them out of the stored `hidden` and `context`. `parseForm` warns when a comparison literal can never match (wrong type for the field or hidden input, not one of a choice's options, `in` without a list), and rejects a rating `props.max` outside 2 to 10 and a `maxLength` that is not a whole number above 0. Empty answers (blank text, `""`, `[]`) are no longer stored, and a cleared field is left out of `answers()` rather than sent empty: replace a saved draft with it, don't merge into it. `ignored` lists each key once. Number hidden inputs accept only plain decimals such as `-3` or `0.5` (no longer `" 12 "`, `"0x1A"`, `"1e3"`, `"+5"` or `".5"`). Recall tokens in endings and the introduction that name nothing are warned about. Optional options of `createForm`, `validateSubmission` and the field builders accept `undefined` under `exactOptionalPropertyTypes`.
- `genesis-forms-react`, `genesis-forms-web`: optional hook options and `<Form>` props accept `undefined` under `exactOptionalPropertyTypes`. `onChange`'s docs say it fires on every state change.
- `genesis-forms-devtools`: identifying fields and hidden inputs are masked like sensitive ones, in share links and in the State and Timeline panels.
- Peer ranges on other forms packages are now `>=0.1.1 <1.0.0` (on `genesis-forms`) and `>=0.1.0 <1.0.0` (on `-react`), so a minor `genesis-forms` release no longer forces dependents to `1.0.0`.
