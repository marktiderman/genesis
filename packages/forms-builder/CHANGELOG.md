# @marktiderman/genesis-forms-builder

## 0.1.1

### Patch Changes

- 46d6f5e: `<FormBuilder>`: `onChange(value)` fires on every edit, undo and redo, at once (and on unmount for text still being typed); the analysis comes separately through `onAnalysis(analysis, value)`. `actions` get the current value plus a `state` with `analysing`, `getValue()`, `getAnalysis()` and `flush()`, and a `ref` exposes the same handle. New props for building variants on the builder: `palette`, `fieldEditors`, `blockKinds`, `previewRegistry` and `previewValidators`. `setIdGenerator` makes generated ids reproducible.
