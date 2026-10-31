---
"@marktiderman/genesis-media": patch
---

`createSignedMediaHandler`: an `onError` hook that throws (or returns a promise that rejects) no longer turns the request into a 500; the answer stays the same 403 as no route.
