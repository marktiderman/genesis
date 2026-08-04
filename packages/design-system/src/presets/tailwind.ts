/**
 * Tailwind v4 compatible preset for Genesis projects.
 *
 * Usage in a child project's tailwind.config.ts:
 *   import { genesisPreset } from "@marktiderman/genesis-design-system/presets/tailwind";
 *   export default { presets: [genesisPreset], ... }
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
