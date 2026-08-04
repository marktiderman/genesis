import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeButton,
  NativeDrawer,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function DrawerSample() {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"left" | "right">("left");
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 12 }}>
        <NativeText preset="h1">Drawer</NativeText>
        <NativeText preset="body" className="text-muted-foreground">
          Tap backdrop or swipe to dismiss.
        </NativeText>
        <NativeButton
          testID="drawer-left"
          onPress={() => {
            setSide("left");
            setOpen(true);
          }}
        >
          Open left
        </NativeButton>
        <NativeButton
          testID="drawer-right"
          variant="secondary"
          onPress={() => {
            setSide("right");
            setOpen(true);
          }}
        >
          Open right
        </NativeButton>
      </ScrollView>
      <NativeDrawer open={open} onOpenChange={setOpen} side={side} testID="drawer">
        <View style={{ gap: 12 }}>
          <NativeText preset="h3">Drawer ({side})</NativeText>
          <NativeText preset="body-sm" className="text-muted-foreground">
            Navigation, account switcher, or supplementary controls.
          </NativeText>
          <NativeButton testID="drawer-close" onPress={() => setOpen(false)}>
            Close
          </NativeButton>
        </View>
      </NativeDrawer>
    </SafeAreaView>
  );
}
