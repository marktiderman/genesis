---
"@marktiderman/genesis-product": patch
---

- `catalogAt` tells "the file isn't at that ref" from "its contents couldn't be read" by checking the tree, which a partial (`blob:none`) clone has without the network. A blob that can't be fetched now throws instead of reading as an empty catalog, which made every beta or live feature look new.
- The README says how this repo's Release workflow runs `genesis-product release`: draft notes as a sticky comment on the open version PR, then after a successful publish a `release/<YYYY-MM-DD>` tag whose GitHub release holds the notes, and `--notify --yes` to close the ideas it answered.
