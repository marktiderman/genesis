---
"@marktiderman/genesis-chat": patch
---

Review fixes:
- A hosted video (Mux, Cloudflare) belongs to one attachment and always starts pending, so nobody can attach, delete or take the webhook for someone else's upload by copying its id.
- The badge, push badge and inbox count unread the same way: readable messages from others on the main timeline, never internal notes.
- Your own sent message lands in the list straight away.
- The composer stops loading when you have no role here and says you can't post.
