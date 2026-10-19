---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-switchboard": minor
---

**One schema model in genesis-core** (DATA-STUDIO.md decisions 11–13, 30). Additive; per `docs/FRAMEWORK.md` rule 5, a **minor**.

- **`@marktiderman/genesis-core/schema`** (new, React-free subpath; also on the root barrel): `FieldSchema`, `ResourceContract`, `DataRow` and `StorageType`, promoted from the switchboard. A field now carries its storage `type` plus an optional `widget` hint (the existing form `FieldType`), `dbType`, `nullable`, `hasDefault`, `generated`, `enumValues`, `references`, and per-user `permissions` (`{ read, update, reason? }`). `ResourceContract.key` is `string | readonly string[]` for composite keys. New: `ResourceSchema` (a contract plus `access` and an optional trusted `version` field), `ResourceSummary`, `ProviderCapabilities`, `AuditEntry`, and `keyFields` / `encodeRecordKey` / `decodeRecordKey`, which carry a composite key through the existing `Identifier` slot as a canonical string.
- **`DataWriteError` / `isDataWriteError`** with a `WriteOutcome` (`conflict`, `gone`, `forbidden`, `invalid`, `audit_failed`, `unauthenticated`, `error`) — also exported from `/provider`.
- **`DataProvider`** gains optional `describe`, `listResources` and `capabilities`; `UpdateParams` gains optional `expectedVersion`; `UpdateResult` gains optional `version` and `audit`. Existing providers are unaffected.
- **genesis-switchboard:** `FieldSchema`, `FieldType`, `DataRow` and `ResourceContract` are now **deprecated aliases** of the core types (`FieldType` → `StorageType`). The Level-bound contract is `SwitchboardContract` (core's `ResourceContract` plus `sourceOfTruth`, with a single-field `key`). The aliases stay until the next major. The published types inline the core definitions, so genesis-core stays an optional peer.
