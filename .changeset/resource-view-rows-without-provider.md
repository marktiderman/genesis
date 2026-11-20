---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": patch
---

A `ResourceView` over rows it was given (`rows`) no longer needs a data provider: nothing is read
or run through one, so it renders without `GenesisProvider`. core adds `useOptionalDataProvider`
and `requireDataProvider`; `useResource`, `useInfiniteResource` and `useOne` take the provider only
when they read (an enabled hook without one still fails as it renders, with the same error), and
`useCapabilities` and live updates ask nothing without one. genesis-ui's list actions and export
run through the provider only when there is one.
