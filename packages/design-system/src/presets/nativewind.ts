/**
 * Tailwind v3 preset for NativeWind v4 apps, the one Genesis React Native
 * components (`@marktiderman/genesis-ui-native`) need:
 *
 *   import nativewindPreset from "nativewind/preset";
 *   import { genesisNativewindPreset } from "@marktiderman/genesis-design-system/presets/nativewind";
 *   export default { content: [...], presets: [nativewindPreset, genesisNativewindPreset] };
 *
 * On top of {@link genesisPreset} it adds the theme's role colors
 * (`bg-primary`, `border-input`, `text-foreground`, `text-destructive`…, as
 * `hsl(var(--primary))`) and declares their variables, light on `:root` and
 * dark under `prefers-color-scheme: dark`, the same values as
 * `themes/genesis.css`. NativeWind v4 can't import that stylesheet, so
 * without this preset those classes aren't generated at all and the
 * components render unstyled (default black borders, buttons with no fill).
 *
 * The radius scale stays `calc(var(--radius) - 2px)` and friends: NativeWind
 * resolves `calc()` and `var()` at runtime (with its 14px rem).
 *
 * NativeWind v5 / Tailwind v4 apps import the CSS instead (see
 * `presets/tailwind`).
 *
 * @stability Beta
 */
import { genesisPreset } from "./tailwind";
import { GENESIS_THEME_BRAND, tailwindColorVariables, themeVariables } from "../tokens/theme-css";

type ColorValue = string | Readonly<Record<string, string>>;

const roleColors = tailwindColorVariables();
const baseColors = genesisPreset.theme.extend.colors as Readonly<Record<string, ColorValue>>;

// A key in both (success, warning, info) keeps its scale and takes the theme variable as DEFAULT,
// as the Tailwind v4 bridge does on web.
const colors: Record<string, ColorValue> = { ...baseColors };
for (const [key, value] of Object.entries(roleColors)) {
  const base = baseColors[key];
  colors[key] = base && typeof base === "object" ? { ...base, DEFAULT: value } : value;
}

const variables = themeVariables(GENESIS_THEME_BRAND);

interface AddBase {
  addBase: (base: Record<string, unknown>) => void;
}

export const genesisNativewindPreset = {
  theme: {
    extend: {
      ...genesisPreset.theme.extend,
      colors,
    },
  },
  plugins: [
    ({ addBase }: AddBase) => {
      addBase({
        ":root": variables.light,
        "@media (prefers-color-scheme: dark)": { ":root": variables.dark },
      });
    },
  ],
};
