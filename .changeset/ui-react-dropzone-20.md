---
"@marktiderman/genesis-ui": minor
---

`FileUploadField` takes react-dropzone 14 through 20; the peer range was `^14 || ^15`. Nothing in its
use changed across those majors. On 19 and later, dropping several files on a single-file field
keeps the first and reports the rest as too many, where 15 rejected them all.
