---
"@marktiderman/genesis-chat": minor
---

- Native: an `attachment` slot for the app's own attachment kinds (`ChatThreadScreen slots={{ attachment }}`, `MessageBubble attachmentSlot`), the twin of the web slot. It gets the web slot's props (`attachment`, `message`, `url`, `mine`) plus `kind`, the kind's `action` ready to call, `run(task)` with `pending` and `error` for the app's own actions (tick a task), `fallback` (the card it would have been) and `testID`. It draws every kind the package doesn't draw, registered or not; `null` hides unregistered kinds; a slot that throws shows the card. The kind's action stays the bubble's VoiceOver action. The default card's button is 44 points tall and shows busy while an `onPress` that returns a promise runs, and an error line if it rejects.
- A kind's `action().onPress` may return a promise (the web card catches its rejection).
- Native reply quotes, the reply bar and the jump announcement name an app kind by its `label`, as the inbox and the long-press sheet do.
- Native voice notes show their transcript under the player ("Transcribing…" until it is ready), folded to three lines with "Show more", and the bubble reads it to VoiceOver.
- `ChatErrorBoundary` moved to `src/react/error-boundary.tsx` (no DOM) so native shares it; `/web` still exports it.
