---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
"@marktiderman/genesis-cli": patch
---

A record's page is now a **record page**, so "workspace" can mean where the viewer is working (ADR 0004). `defineWorkspace` is `defineRecordPage`, `ResourceWorkspace` is `RecordPage`, `NativeResourceWorkspace` is `NativeRecordPage` (with `NativeRecordPageMenu` and `getNativeRecordPageStackOptions`), and the `Workspace…` types are `RecordPage…`. The components take `page` in place of `workspace`. The old names still work for one minor release, marked deprecated. The doctor rule `ui/record-pages-use-resource-workspace` is now `ui/record-pages-use-record-page`: rename it in an app's config if the app sets its level. Message keys (`messages.workspace`) and default test ids (`resource-workspace`) are unchanged.
