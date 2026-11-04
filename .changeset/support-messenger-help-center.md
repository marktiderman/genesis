---
"@marktiderman/genesis-support": minor
---

The help desk's person side. `SupportMessenger` and `SupportMessengerLauncher` (`/web-chat`) are Home, Messages and Help, opening in the chat dock when the app has one; `useMessengerHome`, `useHelpCenter`, `useHelpArticle` and `useStartConversation` (`/native`) are the same on the phone. Migration `0010_genesis_support_help_center.sql`, in a new `support-helpdesk` block, adds a tenant's help center: collections and articles, written in `SupportHelpCenterAdmin`, and `helpCenterPages` for a public site. `supportHelpAnswerTask` (`/ai`) is an optional AI answer: off until a tenant opts in, grounded only in its published articles, citing them, and always offering a person. `FeedbackRecord` gains `tenantId`, and `myReports` a `tenantId` filter.
