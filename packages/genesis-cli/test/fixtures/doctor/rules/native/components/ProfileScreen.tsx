import {
  ActivityIndicator as Spin,
  Modal,
  StyleSheet,
} from "react-native";
import { NativeText, ScreenContainer } from "@marktiderman/genesis-ui-native";

export function ProfileScreen() {
  return (
    <ScreenContainer header={{ title: "Profile" }}>
      <Modal visible={false} />
      <Spin />
      <NativeText style={styles.name}>Ada</NativeText>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  name: { color: "#ff0000", backgroundColor: "rgba(0, 0, 0, 0.5)" },
});
