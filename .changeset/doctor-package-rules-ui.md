---
"@marktiderman/genesis-ui": patch
---

Declares its doctor rules (`ui/lists-use-resource-view`: lists are a view rendered by ResourceView, with ResourcePage only inside a component that renders it; `ui/record-pages-use-resource-workspace`: route files with a `$param` or `[param]` segment or name, `.tsx` or `.jsx`, that build their own record header instead of rendering ResourceWorkspace; a list rendered on the page doesn't exempt it) and its primitives. SKILL.md's "Reach for this first" and "Data views without hand-rolling" now lead with `defineView` + `ResourceView`, `ResourceWorkspace` and `NativeResourceView`; ResourcePage is the escape hatch.

Features: doctor-package-rules
