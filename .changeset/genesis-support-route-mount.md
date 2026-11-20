---
"@marktiderman/genesis-support": minor
---

**One route file per zone on the phone.** `/native` gains `SupportRoute`: two one-line files under
`basePath` (`index.tsx` and `[...route].tsx`) render every support screen (reports, feedback,
thread, ideas, shipped, the messenger's home, message, help and article, and an agent's queues and
ticket), with the header through `createSupport`'s new `router` (`Stack.Screen`,
`useLocalSearchParams`), and `screens` for the app's own. `createSupport` takes `zones`: every link
support opens stays in the zone the person is in, so an app with several navigation zones mounts
support once per zone without a re-export file per screen. The core gains `supportScreenOf`,
`zoneOf`, `stripZone` and `inZone`; `supportPaths` gains `agent` and `agentThread`.
