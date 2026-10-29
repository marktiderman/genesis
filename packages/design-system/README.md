# @marktiderman/genesis-design-system

Genesis's design tokens, the canonical brand schema, a default brand (`brand-genesis`) and the
theme generation that turns one brand into a web theme and a native theme. Layer **foundation**,
group **core**; essential. Every Genesis component reads its colours, type, spacing and radii
from here, so a brand change is configuration, never component code.

## Install

```bash
pnpm add @marktiderman/genesis-design-system
```

No runtime dependencies.

## Entry points

| Import | What it holds |
| --- | --- |
| `@marktiderman/genesis-design-system` | Tokens, `validateBrand`, `tailwindFromBrand`, `themeFromBrand`, `GenesisThemeProvider`, `useTheme`, the `genesisBrand` default |
| `@marktiderman/genesis-design-system/tokens`, `/tokens/native` | The raw tokens, for web and React Native |
| `@marktiderman/genesis-design-system/theme` | The theme provider and `useTheme`, on web and native |
| `@marktiderman/genesis-design-system/providers/native` | The native theme provider |
| `@marktiderman/genesis-design-system/presets/*` | Tailwind and NativeWind presets |
| `@marktiderman/genesis-design-system/schema/brand`, `/schema/brand.schema.json` | The brand schema as types and as JSON Schema |
| `@marktiderman/genesis-design-system/themes/*.css` | Generated CSS themes: `genesis.css`, `genesis-tailwind4.css` |

## Quick start

On the web, import the theme before Tailwind's utilities are used:

```css
@import "tailwindcss";
@import "@marktiderman/genesis-design-system/themes/genesis.css";
@import "@marktiderman/genesis-design-system/themes/genesis-tailwind4.css";
```

Your own brand is a `CanonicalBrand` object. Check it, then derive both platforms from it:

```ts
import { tailwindFromBrand, themeFromBrand, validateBrand } from "@marktiderman/genesis-design-system";
import { brand } from "./brand";

const result = validateBrand(brand);
if (!result.ok) throw new Error(result.errors.join("\n"));
export const web = tailwindFromBrand(brand);
export const native = themeFromBrand(brand);
```

Brand-specific scales go in the schema's `extensions` slot, so the canonical shape never forks.

## Read next

- [genesis-ui](../ui/README.md) and [genesis-ui-native](../ui-native/README.md), which consume it.
- [docs/MIGRATION.md](../../docs/MIGRATION.md): theme and brand changes by version.
- [The Genesis way](../../docs/FRAMEWORK.md).

## License

MIT
