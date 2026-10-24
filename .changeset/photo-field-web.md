---
"@marktiderman/genesis-forms-web": minor
---

A renderer for the `photo` field: "Choose a photo", and "Take a photo" (the camera) on touch devices; type, size and count checked before uploading; a thumbnail (or the file's name when the browser can't draw it) and a remove button per photo. The file goes to the host through the new `Form` prop `onUpload(file, field) => Promise<PhotoRef>` (or an `UploadContext` around the form), so the renderer stays storage-agnostic; a rejected upload shows under the field. While a photo is uploading the form neither moves on nor sends, and says "Wait for the photo to finish uploading." Without a host, a photo field says photos can't be added. New exports: `UploadContext`, `useUpload`, `UploadHost`, `UPLOAD_WAIT_MESSAGE`, `photoAccept`, `photoFileProblem`, `photoFileType`.
