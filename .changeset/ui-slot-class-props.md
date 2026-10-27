---
"@marktiderman/genesis-ui": minor
---

Slot class props for parts a component draws for itself, merged after the defaults:

- `DialogContent`, `AlertDialogContent` and `SheetContent` take `overlayClassName` for their backdrop, e.g. `overlayClassName="z-[60]"` to open a dialog above a side panel.
- `Table` takes `containerClassName` for its scroll box (now `data-slot="table-container"`), so a sticky header can scroll inside it: `<Table containerClassName="max-h-96">`. `TableProps` is exported.
