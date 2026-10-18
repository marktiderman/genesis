/**
 * Tailwind v3-shaped JS preset (`theme.extend.*`) for Genesis projects.
 *
 * Usage in a v3 project's tailwind.config.ts (or a v4 project still loading a
 * JS config through `@config`):
 *   import { genesisPreset } from "@marktiderman/genesis-design-system/presets/tailwind";
 *   export default { presets: [genesisPreset], ... }
 *
 * Tailwind v4 projects should not use this. Import the CSS instead:
 *   @import "tailwindcss";
 *   @import "@marktiderman/genesis-design-system/themes/genesis.css";
 *   @import "@marktiderman/genesis-design-system/themes/genesis-tailwind4.css";
 */

import { neutral, semantic } from "../tokens/colors";
import { fontFamily } from "../tokens/typography";
import { borderRadius } from "../tokens/spacing";

export const genesisPreset = {
  theme: {
    extend: {
      colors: {
        neutral,
        success: semantic.success,
        warning: semantic.warning,
        error: semantic.error,
        info: semantic.info,
      },
      fontFamily: {
        sans: fontFamily.sans.split(", "),
        display: fontFamily.display.split(", "),
        mono: fontFamily.mono.split(", "),
      },
      borderRadius,
    },
  },
} as const;
