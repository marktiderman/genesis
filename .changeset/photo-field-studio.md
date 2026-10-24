---
"@marktiderman/genesis-forms-studio": minor
---

`PhotoAnswer` (`{ photos, resolveUrl }`): a response's photos as thumbnails, each opening full size in a new tab. Data-agnostic: the host resolves each `PhotoRef` to an address it may show, such as a short-lived signed link, or null. A photo most browsers can't draw (HEIC) or that fails to load is a tile with its name and an Open link; one that can't be resolved says "Photo unavailable".
