/**
 * Internal context for the unified theme — PRD-07 A2b.
 *
 * Lives in its own module so `provider.web.tsx`, `provider.native.tsx`,
 * and `use-theme.ts` all reference the same context instance regardless
 * of which platform-specific provider implementation got bundled.
 */

import { createContext } from "react";
import type { UseThemeReturn } from "./theme";

export const GenesisThemeContext = createContext<UseThemeReturn | null>(null);
