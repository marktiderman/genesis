---
"@marktiderman/genesis-ui": patch
---

Brand accents: `accessibleAccent` now checks contrast on the rounded HSL triplet it actually emits, so the rendered `--primary` always reaches 4.5:1 on white (new `strongTriplet` field). `parseColor` also accepts `hsl()`/`hsla()` and bare token triplets like `"160 84% 39%"`; anything unparseable still falls back to Genesis's primary.
