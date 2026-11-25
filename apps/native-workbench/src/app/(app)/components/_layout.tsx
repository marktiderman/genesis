import { Stack } from "expo-router";

/** Each tab is a stack, so its screens get the platform's own header. */
export default function ComponentsStack() {
  return <Stack />;
}

/** A screen in this tab that throws shows Try again here; the tab bar and the other tabs keep working. */
export { ScreenErrorBoundary as ErrorBoundary } from "@/lib/errors";
