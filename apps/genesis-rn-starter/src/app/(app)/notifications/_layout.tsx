import { Stack } from "expo-router";

/** Each tab is a stack, so its screen gets the platform's own header. */
export default function NotificationsStack() {
  return <Stack />;
}

/** A screen in this tab that throws shows Try again here; the tab bar and the other tabs keep working. */
export { ScreenErrorBoundary as ErrorBoundary } from "@/lib/observability";
