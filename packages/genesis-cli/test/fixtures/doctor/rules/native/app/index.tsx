import { Platform, PlatformColor } from "react-native";
import { NativeText, ScreenContainer } from "@marktiderman/genesis-ui-native";

export default function Home() {
  const tint = Platform.OS === "ios" ? PlatformColor("systemBlue") : undefined;
  return (
    <ScreenContainer header={{ title: "Home" }}>
      <NativeText style={{ color: tint }}>Hello</NativeText>
    </ScreenContainer>
  );
}
