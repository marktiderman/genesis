import { Redirect, Stack } from "expo-router";
import { useSession } from "@marktiderman/genesis-native";
import starter from "../../../../starter.config";

/** The Messages tab (`features.chat`): a stack, under the signed-in person's chat (`ChatRoot`, in the tabs' layout). */
export default function MessagesStack() {
  const { userId } = useSession();
  if (!starter.features.chat) return <Redirect href="/" />;
  if (!userId) return null;
  return <Stack />;
}

/** A screen in this tab that throws shows Try again here; the tab bar and the other tabs keep working. */
export { ScreenErrorBoundary as ErrorBoundary } from "@/lib/observability";
