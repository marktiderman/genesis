---
"@marktiderman/genesis-ui": patch
---

Declares its doctor rules (`ui/lists-use-resource-view`: lists are a view rendered by ResourceView, with ResourcePage only inside a component that renders it; `ui/record-pages-use-resource-workspace`) and its primitives. SKILL.md's "Reach for this first" and "Data views without hand-rolling" now lead with `defineView` + `ResourceView`, `ResourceWorkspace` and `NativeResourceView`; ResourcePage is the escape hatch.

Features: doctor-package-rules
