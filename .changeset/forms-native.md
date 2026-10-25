---
"@marktiderman/genesis-forms-native": patch
---

New package, `@marktiderman/genesis-forms-native` 0.1: `<FormFocus>`, the React Native renderer for Genesis Forms in focus layout, on genesis-forms-react's `useFormController`. One question or content step (heading, text, a host's callout) per screen; field renderers registered by kind for short and long text, email, phone, number, date, single and multiple choice, dropdown, rating, NPS, yes/no, consent, calculated and photo (through a host's picker and storage); filtered lists, a search box over long lists, "Other" answers and `respondentPath` progress. Keyboard-aware scrolling, accessibility focus and spoken announcements, Dynamic Type, reduced motion, haptics, and a theme seam over theme roles (iOS system colors by default), with no NativeWind needed. The platform header is set through `screen` (expo-router's `Stack.Screen`). Slots: `header`, `brand`, `progress`, `navigation`, `ending`, `errorSummary`, `notice`, `status`. `draft` takes `useFormDraft`'s result (loading, resume, a save when the app goes to the background, cleared once the submission is safe) and `outbox` a `createSubmitOutbox` outbox (one idempotency key per response, the queued submission's status on the ending).

Features: forms-native
