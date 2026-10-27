---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui": patch
---

- **Edit validation:** a `readOnlyOnEdit` field is no longer checked, so a row loaded without a required read-only field can still be saved.
- **Hidden fields:** they are never filled from the URL. They belong to the screen, as its filter or defaults.
- **Create forms:** a mounted create form follows new screen defaults. Hidden values always update; the rest update only while the form is untouched.
- **Saved row:** an edit with nothing to write passes its id to `onSuccess`.
- **Web timestamps:** a timestamp is read on the ViewerScope's clock when its column has no zone of its own.
