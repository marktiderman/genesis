---
"@marktiderman/genesis-core": minor
---

Workspaces (ADR 0004): `@marktiderman/genesis-core/workspaces` describes where the viewer is working (one organization, the roll-up, or personal) and reads it from the URL (`workspaceAt`, `workspaceHref`, `defaultWorkspace`, `groupWorkspaces`). `WorkspaceScope` replaces `ViewerScope` in an app with workspaces: it scopes every view under it to the current workspace and remembers it per viewer.
