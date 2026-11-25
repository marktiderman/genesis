/**
 * The devtools overlay (`features.devtools`), in development, preview and
 * internal builds only. Two locks:
 *
 * 1. At build time: the condition below is folded by Metro (`__DEV__` and
 *    `EXPO_PUBLIC_APP_VARIANT`, which eas.json and the EAS workflows set next
 *    to `APP_VARIANT`), so a production bundle, or one built without the
 *    variable, has no `require` of the overlay and none of its code. Keep the
 *    condition written out here: a variable or a helper would stop Metro
 *    folding it.
 * 2. At run time: `enabled` is a fact of the binary, the `.dev` / `.preview`
 *    bundle id the variant gave it (see `devtools-overlay.ts`).
 */
import type { DevtoolsBlock } from "@marktiderman/genesis-native/devtools";
import starter from "../../starter.config";

export const devtools: DevtoolsBlock | undefined =
  __DEV__ || process.env.EXPO_PUBLIC_APP_VARIANT === "development" || process.env.EXPO_PUBLIC_APP_VARIANT === "preview"
    ? starter.features.devtools
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("./devtools-overlay") as typeof import("./devtools-overlay")).createStarterDevtools()
      : undefined
    : undefined;
