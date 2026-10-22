---
"@marktiderman/genesis-ui": minor
---

Add rich text: `RichTextEditor` on `@marktiderman/genesis-ui/rich-text-editor` (Tiptap 3, Genesis toolbar, headings, bold/italic/underline, lists, safe links, quotes, optional YouTube/Vimeo/Loom embeds, placeholder, character count, keyboard shortcuts, controlled or uncontrolled, `readOnly`/`disabled`, SSR-safe) and `RichText` plus server-safe helpers on `@marktiderman/genesis-ui/rich-text` (`sanitizeRichTextDoc`, `richTextToHtml`, `richTextToPlainText`, `isSafeUrl`, `parseVideoUrl`). JSON is the canonical value; HTML is derived through an allow-list. The `@tiptap/*` packages are new optional peers, needed only by apps that import the editor. Neither subpath is re-exported from the package root.
