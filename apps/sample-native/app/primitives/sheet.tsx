import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeButton,
  NativeSheet,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function SheetSample() {
  const [open, setOpen] = useState(false);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 12 }}>
        <NativeText preset="h1">Sheet</NativeText>
        <NativeText preset="body" className="text-muted-foreground">
          Bottom sheet uses @gorhom/bottom-sheet when installed; falls back to
          a basic Modal otherwise.
        </NativeText>
        <NativeButton testID="sheet-open" onPress={() => setOpen(true)}>
          Open sheet
        </NativeButton>
      </ScrollView>
      <NativeSheet open={open} onOpenChange={setOpen} testID="sheet">
        <View style={{ gap: 12 }}>
          <NativeText preset="h3">Sheet content</NativeText>
          <NativeText preset="body-sm" className="text-muted-foreground">
            Drag down or tap the backdrop to dismiss.
          </NativeText>
          <NativeButton testID="sheet-close" onPress={() => setOpen(false)}>
            Close
          </NativeButton>
        </View>
      </NativeSheet>
    </SafeAreaView>
  );
}
