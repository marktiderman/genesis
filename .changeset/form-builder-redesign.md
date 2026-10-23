---
"@marktiderman/genesis-forms-builder": minor
---

Redesigned the Questions and Logic and endings panels.

- **Questions**: three columns. An outline of every block (drag or keyboard reorder through genesis-ui's `SortableList`, a dashed Add question, the endings), one focused editor for the selected block (type chip, Move, Duplicate, Delete, a large title, the answer settings with segmented controls, for example a rating's Scale 1–3 / 1–5 / 1–10 / Other and Numbers / Stars, Required with a one-line explanation, Advanced closed), and the live preview beside them. The preview and checks stay one column beside every panel, mounted across panels, so the device, layout and typed answers survive a switch (Logic and endings shows the flow map over it). Three columns fit from a 56rem builder; narrower containers stack outline, editor, preview.
- **Preview**: phone or desktop frame, One by one / One page, and "Live preview · updates as you type".
- **Logic and endings**: rules read as sentences of picker pills with a kind chip (Jump, Show only when, Hide when), a reorder handle and a menu. Endings show as cards with Default and "Used by …". A new Flow map shows the steps, jump branches and endings, sums up the path checks and has Try a path buttons.
- New host hooks: `toolbar={false}` hides the title / undo / status / actions row; `onHistoryChange({ canUndo, canRedo })`; `FormBuilderHandle.undo()`, `.redo()`, `.canUndo()`, `.canRedo()`; `settingsLayout={(formSettings) => …}` to lay out the Settings panel (the form settings then drop their own "Form" heading; `SettingsPanel` takes `formHeading={false}` for the same); `settingsRow={SettingsRow}` for the form settings' rows.
- `Finding.code` now also names the path checks: `"unreachable-block"`, `"rule-never-fires"`, `"unreachable-ending"`, `"paths-not-checked"`. "Question n needs a title" counts questions only, as the outline does.
- New exports: `FlowMap`, `flowCheck`, `RuleSentence`, `RuleKindChip`, `PATH_FINDINGS`, `questionNumbers`, `RowLayoutContext`, `BuilderHistoryState`, `SettingsRowSlotProps`. `QuestionsPanel` takes optional `preview` and `onOpenEnding`; `LogicAndEndingsPanel` takes optional `aside` and `flow`; `ConditionEditor` takes optional `inline`, `linkedJump` and `onRelink`. Every existing prop still works.
