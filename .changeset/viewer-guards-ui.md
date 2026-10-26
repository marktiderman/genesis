---
"@marktiderman/genesis-ui": patch
---

ResourceView and ResourceWorkspace pass the viewer (`useViewer()`) to the view's guards and `when`: cells, the peek, create, edit and delete, header actions and the settings lock. A new viewer or new roles asks them again.

Features: resource-page, resource-workspace
