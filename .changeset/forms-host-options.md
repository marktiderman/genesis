---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-builder": minor
"@marktiderman/genesis-forms-web": minor
---

Options from the app: a single choice, multiple choice or dropdown question can take its options from the app showing the form, such as a coach picker that always lists a practice's current coaches.

- **genesis-forms**: a choice field may set `props.optionsFrom: { source: "host", key }` (`f.singleChoice`, `f.multiChoice` and `f.dropdown` take `optionsFrom`, and `options` is then optional). `createForm` and `replay` take `hostOptions` (lists by key, `{ value, label }[]`): `engine.definition` has them filled in after the question's own options, so renderers show them and only these values validate. `validateSubmission` takes `hostOptions` too, loaded on the server, so a value the server doesn't offer now is refused. New exports: `withHostOptions`, `optionsSource`, `HostOptions`, `OptionsSource`. `parseForm` checks the shape of `optionsFrom` (an issue), warns when a non-choice type sets it, and no longer warns about rules comparing such a question with a value only the app supplies. Definitions without `optionsFrom` behave exactly as before.
- **genesis-forms-builder**: `hostOptions?: HostOptionList[]` on `FormBuilder` and `BuilderConfig` (`{ key, label, description?, sample? }`). A choice question's options read "Options: Typed here | From the app", with a picker of the host's lists; the preview and the path checks use each list's `sample`, and a question using a list the host doesn't offer is a warning. New: `setOptionsSource` (ops), `sampleHostOptions`, `HostOptionList`; `analyze` takes `hostOptions`.
- **genesis-forms-web**: `<Form hostOptions>` passes the lists to the form's engine (with your own `engine`, pass them to `useForm`).
