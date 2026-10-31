---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-web": minor
"@marktiderman/genesis-chat": minor
---

Upload ports, so another upload implementation can plug in without forms or chat depending on it.

- genesis-forms: `UploadAdapter` (and `UploadFile`), the port a form's uploads go through: `upload(file, field)` resolving to the `PhotoRef` the answer keeps, and `url?`. The signed single upload (`createUploadHandler`, `UploadRequest`, `UploadGrant`) is unchanged and stays the built-in one.
- genesis-forms-web: `<Form uploads={adapter}>` takes any `UploadAdapter` (it wins over `onUpload` and an `UploadContext`); `UploadHost` is `UploadAdapter<File>`, and `signedUploadHost` is the built-in adapter.
- genesis-chat: `createTusUpload({ transport })` takes any `TusTransport` (exported with `TusUploadRecord`, `TusUploadSource` and `TusSendInfo`). Without it, its own TUS client sends, as before. chat's paths, file checks and errors stay the same either way, and a transport's refusals (`failure: "forbidden" | "invalid"`) become chat's.
