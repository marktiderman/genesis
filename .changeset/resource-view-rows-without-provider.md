---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": patch
---

A `ResourceView` over rows it was given (`rows`) no longer needs a data provider: nothing is read
or run through one, so it renders without `GenesisProvider`. core adds `useOptionalDataProvider`
and `requireDataProvider`, and `useResource`, `useInfiniteResource` and `useOne` take the provider
only when they use it:
- an enabled hook (one that reads) without a provider still throws as it renders, with the same
  error;
- a disabled hook used only to write (`useResource(name, { enabled: false })`, then `create`,
  `update` or `remove`) renders without one, and its first write fails with that error instead.

`useCapabilities` and live updates ask nothing without a provider. genesis-ui's list actions and
export run through the provider only when there is one.
