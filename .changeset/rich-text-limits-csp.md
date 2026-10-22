---
"@marktiderman/genesis-ui": minor
---

Rich text hardening:

- `sanitizeRichTextDoc` takes `maxCharacters`, `maxNodes` and `onTooDeep: "throw"`. When a document breaks one of them, it throws the new `RichTextLimitError` (`reason`, `limit`, `actual`). Use these on server writes. Without them nothing changes: too-deep content is still dropped and the function never throws.
- `RichTextEditor` no longer injects a `<style>` tag (`injectCSS: false`). Tiptap's base rules are now classes on the editable element, so a strict `style-src` CSP works.
- The `@tiptap/*` peer range is now `^3.31.0`, the version the editor is tested against.
