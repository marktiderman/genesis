---
"@marktiderman/genesis-features": minor
---

Content packs are generic. A pack's data goes in `sections`, keyed by the block that owns it (`sections: { meetings: [...] }`). Genesis checks what every pack shares (id, version, publisher, requires, labels, and a unique `key` on every item) and that each section's block is in `requires`; what an item holds is checked by the validator its block registers, the new `contributes.contentSection` on `defineBlock`. `contentPackProblems(pack, options)` takes `{ installed, blocks, validators }` (validators by block id win over a block's own), and still takes the installed blocks alone; `defineContentPack(pack, { blocks })` checks with them too. New types: `ContentPackSections`, `ContentPackSectionValidator`, `ContentPackCheckOptions`.

Nothing breaks: the typed sections (`sessionTypes`, `metricTemplates`, `fieldDefinitions`, `forms`, `roadmapTemplates`), their types and `CONTENT_PACK_FIELD_TARGETS` still work and are checked as before, and are deprecated. Move that data into `sections` under the block that owns it, with that block's validator.

Features: content-packs
