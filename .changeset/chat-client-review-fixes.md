---
"@marktiderman/genesis-chat": patch
---

Fixes from the review of the phases 2–4 client:
- Working hours are normalised when read (`normalizeHours`; only mon..sun days of `"HH:MM"` string pairs, at most four a day), the availability helpers never throw, and migration 0002 refuses anything else (`genesis_chat.valid_working_hours`, in `set_availability` and as a table check).
- One message can't crash a thread: rows render inside `ChatErrorBoundary`, app attachment kinds are looked up by own key only (`constructor` no longer resolves) with checked results, and a throwing slot falls back to the generic card.
- The outbox: `clear()` stops sends in flight (nothing posts or saves afterwards; uploads get an aborted `signal`); retries go in order per conversation and stop at the first that can't go; refusals are `permanent` and only retried by hand; `releasePreview` frees a preview URL once its message lands.
- Catch-up on join pages until it has everything (10 pages at most, then the newest page with `hasEarlier`).
- The video recorder turns off a camera that answers after it closed, handles recorder errors, keeps the preview for the outbox, and can cancel a hosted upload.
- Broadcast and scheduled send keep one clientId per draft until it goes, and guard against a double submit.
- Privacy: link preview images are off by default (`linkPreviewImages: "off" | "proxy" | "direct"`, `linkPreviewProxyUrl`), and the emoji picker loads only from the app's `emojibaseUrl`, never jsDelivr.
- Link previews load one query per message, at most four at once.
- A topic view no longer marks the conversation read; search snippets can't be faked with « »; the schedule dialog's default time is set when it opens.
