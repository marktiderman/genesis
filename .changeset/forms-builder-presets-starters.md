---
"@marktiderman/genesis-forms-builder": minor
---

**Field presets and starter templates.** Additive.

- `FormBuilder presets={[…]}` (also on `BuilderConfig`) adds named variants of a field type to the Add menu, e.g. a `table` with fixed columns or a `list` capped at four items. A `FieldPreset` has `id`, base `type`, `label`, and optional `description` (hover hint), `icon`, `category`, `props` (laid over the type's default props) and `field` (`label`, `description`, `placeholder`, `required`). Picking one adds an ordinary field of the base type. The Type select still lists base types only, and a preset whose base type isn't registered is skipped. New exports: `FieldPreset`, `PresetEntry`, `palettePresets`, `createPresetField`.
- `STARTER_TEMPLATES`: six opt-in, neutral example forms (Customer feedback, Event feedback, Contact request, Action plan, Video notes, Reading notes) that show which field suits which question. They are not in `TEMPLATES`; offer them with `[...TEMPLATES, ...STARTER_TEMPLATES]`.
