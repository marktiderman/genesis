import { Stack, router } from "expo-router";
import { NativeButton, NativeEmptyState, ScreenContainer, composeHeaderOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";

/** The first tab. Replace it with your app's home screen. */
export default function HomeScreen() {
  const checkIn = starter.features.checkIn ? (
    <NativeButton testID="home-check-in" onPress={() => router.push("/check-in")}>
      {copy.home.checkIn}
    </NativeButton>
  ) : null;
  // The same form opened from a link that fills in the gym, so that question is skipped.
  const fromLink = starter.features.checkIn ? (
    <NativeButton testID="home-check-in-link" variant="outline" onPress={() => router.push("/check-in?gym=hilltop")}>
      {copy.home.checkInFromLink}
    </NativeButton>
  ) : null;
  return (
    <>
      <Stack.Screen options={composeHeaderOptions({ headerTitle: copy.home.title, large: true })} />
      <ScreenContainer scroll testID="home" contentClassName="flex-grow justify-center p-6">
        <NativeEmptyState
          variant="first-run"
          title={copy.home.emptyTitle}
          body={copy.home.emptyBody}
          primaryAction={checkIn}
          secondaryAction={fromLink}
          testID="home-empty"
        />
      </ScreenContainer>
    </>
  );
}
