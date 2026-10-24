import { Stack } from "expo-router";
import { AppHeader } from "../components/AppHeader";

export default function RootLayout() {
  return (
    <>
      <AppHeader />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
