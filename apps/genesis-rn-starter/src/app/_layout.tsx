import "../../global.css";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { GenesisNativeApp } from "@marktiderman/genesis-native";
import { shell } from "@/lib/app";

SplashScreen.preventAutoHideAsync();

// The whole root: GenesisNativeApp owns theme, data, boot, errors and the session. Keep it short (a test holds it to 30 lines).
export default function RootLayout() {
  return (
    <GenesisNativeApp {...shell} splash={SplashScreen}>
      <Stack screenOptions={{ headerShown: false }} />
    </GenesisNativeApp>
  );
}
