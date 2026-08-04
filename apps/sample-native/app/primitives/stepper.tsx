import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeButton,
  NativeStepper,
  NativeText,
} from "@marktiderman/genesis-ui-native";

const steps = [
  { label: "Account" },
  { label: "Profile" },
  { label: "Notify" },
  { label: "Done" },
];

export default function StepperSample() {
  const [current, setCurrent] = useState(0);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">Stepper</NativeText>
        <NativeStepper testID="onboarding-stepper" steps={steps} current={current} />
        <NativeButton
          testID="stepper-prev"
          variant="ghost"
          onPress={() => setCurrent((c) => Math.max(0, c - 1))}
        >
          Back
        </NativeButton>
        <NativeButton
          testID="stepper-next"
          onPress={() => setCurrent((c) => Math.min(steps.length - 1, c + 1))}
        >
          Next
        </NativeButton>
      </ScrollView>
    </SafeAreaView>
  );
}
