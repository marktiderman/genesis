---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-web": minor
---

Upload handshake for `photo` fields, moved up from the host app's feedback photo uploads.

- `genesis-forms/server`: `createUploadHandler({ resolveForm, store, edit?, rateLimit?, ... })`, the
  endpoint that signs one upload per file after checking the form, the field, the file's type and
  size, the attempt id or edit link and the rate limit; the same JSON and status codes the host app
  answered with. `checkUploads(definition, answers, { formId, owner, store })` checks on submit that
  every file the answers name was uploaded by this attempt or for this edit, to that field, stored,
  of an allowed type and size, and no more than the field takes; stored metadata replaces what the
  browser sent. Also `UploadStore`, `StoredUpload`, `UploadOwner`, `uploadFields`, `uploadRules`,
  `attemptHash`, `NOT_UPLOADED_MESSAGE` and `UPLOAD_MESSAGES`.
- `genesis-forms`: the handshake's JSON types `UploadRequest`, `UploadGrant`, `SignedUpload`,
  `UploadRefusal` and `MAX_UPLOAD_REQUEST_BYTES`.
- `genesis-forms-web`: `signedUploadHost({ endpoint, claim, send?, readUrl?, fetch? })`, the browser
  half, an `UploadHost` for `<Form onUpload>`; `UploadHost` takes an optional `url(ref)` for reading
  a stored file. It now needs genesis-forms `>=0.7.0`.
