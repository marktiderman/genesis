---
"@marktiderman/genesis-cli": patch
---

`genesis init --template native` starts apps on newer dependencies: `@hookform/resolvers` ^6, `@sentry/react-native` ~8.31, `@tanstack/react-query` and its persisters 5.104.5, `@shopify/flash-list` 2.3.3 and `@react-native-community/datetimepicker` 9.2.2. `genesis studio init` now accepts `@hookform/resolvers` 5 or 6 (`>=5.1.0 <7`), so it no longer asks an app already on 6 to go back to 5.
