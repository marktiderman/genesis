import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeNumberInput,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function NumberInputSample() {
  const [qty, setQty] = useState(1);
  const [score, setScore] = useState(50);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">NumberInput</NativeText>
        <NativeText preset="label">Quantity (1–10)</NativeText>
        <NativeNumberInput
          testID="qty-input"
          value={qty}
          onChange={setQty}
          min={1}
          max={10}
        />
        <NativeText preset="label">Score (0–100, step 5)</NativeText>
        <NativeNumberInput
          testID="score-input"
          value={score}
          onChange={setScore}
          min={0}
          max={100}
          step={5}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
