import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeSegmentedControl,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function SegmentedSample() {
  const [tab, setTab] = useState<"day" | "week" | "month">("week");
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">Segmented control</NativeText>
        <NativeSegmentedControl<"day" | "week" | "month">
          testID="range-segmented"
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <NativeText preset="body-sm">Selected: {tab}</NativeText>
      </ScrollView>
    </SafeAreaView>
  );
}
