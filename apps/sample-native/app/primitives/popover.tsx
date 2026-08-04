import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativePopover,
  NativePopoverContent,
  NativePopoverTrigger,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function PopoverSample() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">Popover</NativeText>
        <NativeText preset="body" className="text-muted-foreground">
          Anchored content. Tap anywhere off-popover to dismiss.
        </NativeText>
        <View style={{ alignItems: "flex-start" }}>
          <NativePopover>
            <NativePopoverTrigger testID="popover-trigger">
              <NativeText preset="body" className="text-primary">
                Open popover
              </NativeText>
            </NativePopoverTrigger>
            <NativePopoverContent testID="popover-content">
              <NativeText preset="body-sm">
                Helpful supplemental content lives here.
              </NativeText>
            </NativePopoverContent>
          </NativePopover>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
