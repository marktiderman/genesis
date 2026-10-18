---
"@marktiderman/genesis-design-system": minor
---

`themes/genesis.css` now declares `--font-sans` and `--font-mono` alongside `--font-display`, in both `:root` and `.dark`, generated from `tokens/dtcg/typography.json` (previously only `--font-display` shipped, from a hardcoded literal). `--font-sans` defaults to Inter.

New `themes/genesis-tailwind4.css`: the Tailwind v4 `@theme inline` bridge that apps were hand-writing. It maps every Genesis color variable to `--color-*` (`--color-sidebar` → `--sidebar-background`), the radius scale, and `--font-sans` / `--font-display` / `--font-mono`, and declares `@custom-variant dark (&:is(.dark *))`. It is generated from the same variable list as `genesis.css`, so the two can't drift. Import it after `genesis.css`:

```css
@import "tailwindcss";
@import "@marktiderman/genesis-design-system/themes/genesis.css";
@import "@marktiderman/genesis-design-system/themes/genesis-tailwind4.css";
```

`presets/tailwind` is unchanged; its doc comment now says it is a Tailwind v3-shaped preset rather than "Tailwind v4 compatible".

**Upgrade note — app fonts.** If your app sets its own `--font-sans` (or `--font-mono`) only inside `@theme` / `@theme inline`, it will silently switch to Inter after this upgrade. Tailwind 4 puts `@theme` values in `@layer theme`, and `genesis.css`'s unlayered `:root` beats any layered declaration. Move app font overrides to an unlayered `:root` after the imports:

```css
:root {
  --font-sans: "Your Font", ui-sans-serif, system-ui, sans-serif;
}
```

The same applies to any other Genesis variable you override. If you hand-wrote the `@theme inline` bridge, you can delete it and import `genesis-tailwind4.css` instead.
