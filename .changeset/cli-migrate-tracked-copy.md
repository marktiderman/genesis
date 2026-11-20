---
"@marktiderman/genesis-cli": patch
---

`genesis migrate` and the doctor's `migration-drift` no longer flag an app's own earlier draft that shares a package migration's name. When several files hold one package migration and exactly one carries its `genesis-migration` header, that file is the copy and the others are the app's own. Without exactly one header, which file is the copy can't be told, so the migration is still left alone and reported.
