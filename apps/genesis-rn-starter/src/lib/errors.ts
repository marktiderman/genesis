/**
 * The error screens, with "Contact support" under Try again when support has somewhere to write
 * (the `support.contactEmail` / `support.contactUrl` settings: `support.contact()`, kept current
 * while the screen shows). Without one, or with `features.support` off, there is no button.
 */
import { createElement } from "react";
import { FatalScreen, createScreenErrorBoundary, type FatalScreenProps, type ScreenErrorProps } from "@marktiderman/genesis-native";
import { observability } from "./observability";
import { useStarterSettings } from "./settings";
import { support } from "./support";

const contact = () => support?.contact() ?? null;

/** The contact now, again whenever the settings change (they may arrive after the screen). */
function useContact() {
  useStarterSettings();
  return contact();
}

/** The app's fatal screen (GenesisNativeApp's `fatal` slot, in `app.ts`). */
export function AppFatalScreen(props: FatalScreenProps) {
  return createElement(FatalScreen, { ...props, contact: useContact() });
}

function ScreenFallback(props: ScreenErrorProps) {
  return createElement(FatalScreen, { ...props, kind: "screen", contact: useContact() });
}

/**
 * Each tab's `ErrorBoundary` (`export { ScreenErrorBoundary as ErrorBoundary }` in its
 * `_layout.tsx`): a screen that throws shows "This screen hit a problem" with Try again, the tab
 * bar and the other tabs keep working, and the error is reported non-fatal (through Sentry's
 * Expo Router wrapper when the block is on).
 */
export const ScreenErrorBoundary = observability ? observability.screenBoundary(ScreenFallback) : createScreenErrorBoundary({ contact });
