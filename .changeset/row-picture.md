---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": patch
---

`genesis-core/resource-view`: a view's `summary` can carry a picture, `image: { src?, name?, alt? }`. `rowPicture(summary)` says what to draw: the image when `isSafeUrl` accepts its `src` (with initials for when it fails to load), the initials of `name` when the `src` is unsafe or missing, or `null`. `alt` defaults to empty, so the picture is decorative. `initialsOf(name)` takes whole characters, so an emoji or accented letter is never split.

`genesis-ui`: `ResourceView` draws the summary's picture as an avatar beside the first column of the table.
