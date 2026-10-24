import { Stack } from "expo-router";
import { NativeEmptyState, ScreenContainer, composeHeaderOptions } from "@marktiderman/genesis-ui-native";
import { copy } from "@/copy";

/** The first tab. Replace it with your app's home screen. */
export default function HomeScreen() {
  return (
    <>
      <Stack.Screen options={composeHeaderOptions({ headerTitle: copy.home.title, large: true })} />
      <ScreenContainer scroll testID="home" contentClassName="flex-grow justify-center p-6">
        <NativeEmptyState variant="first-run" title={copy.home.emptyTitle} body={copy.home.emptyBody} testID="home-empty" />
      </ScreenContainer>
    </>
  );
}
