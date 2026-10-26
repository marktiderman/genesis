---
"@marktiderman/genesis-chat": patch
"@marktiderman/genesis-notifications": patch
---

Chat pushes sent through genesis-notifications now get Reply, Mark as read and the Communication Notification:

- Chat's Mark read action id is `mark_read`, the same as `MESSAGE_ACTIONS` (device ids take no "-"). A notification already on a phone with the old `mark-read` still marks read.
- The docs and examples put `MESSAGE_ACTIONS` under the `messages` id, the category chat's push handler and genesis-native's notification service extension look for. Before, they said `message`, so on that path Mark read did nothing and the extension skipped the push. If your registry copied the old example, rename `actions: { message: MESSAGE_ACTIONS }` to `messages` and the type's `actions: "message"` to `"messages"`.
