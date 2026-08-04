import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeRangeSlider,
  NativeSlider,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function SliderSample() {
  const [v, setV] = useState(50);
  const [range, setRange] = useState<[number, number]>([20, 80]);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 24 }}>
        <NativeText preset="h1">Slider</NativeText>
        <NativeText preset="label">Single ({v})</NativeText>
        <NativeSlider testID="slider-single" value={v} onChange={setV} />
        <NativeText preset="label">Range ({range[0]}–{range[1]})</NativeText>
        <NativeRangeSlider
          testID="slider-range"
          value={range}
          onChange={setRange}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
