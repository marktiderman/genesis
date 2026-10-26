---
"@marktiderman/genesis-features": minor
---

Content packs: `defineContentPack` (in `/blocks`, zod-free) declares versioned data that fills installed blocks (session types and agendas, metric templates, custom field definitions, forms, roadmap templates, labels) and lists every shape problem at once; `contentPackProblems(pack, installedBlocks)` also refuses a pack whose blocks aren't installed; `contentPackBlocks` names the blocks a pack fills.
