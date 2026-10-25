---
"@marktiderman/genesis-forms": patch
---

`submitResponse` passes every `validateSubmission` option through, so options added later reach it too; the README says edits and progress saves are out of scope and that an endpoint answers `duplicate` as success.
