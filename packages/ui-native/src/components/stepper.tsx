/**
 * Stepper — multi-step indicator showing the user's position in a flow.
 *
 * Use for onboarding, multi-page forms, and checkouts. Renders a
 * horizontal row of step dots/numbers with connecting lines and labels.
 *
 * @stability Beta
 */
import { Text, View } from "react-native";
import { cn } from "../utils";

export interface NativeStepperStep {
  label: string;
  /** Optional second-line description. */
  description?: string;
}

export interface NativeStepperProps {
  steps: NativeStepperStep[];
  /** Zero-indexed current step. */
  current: number;
  className?: string;
  testID?: string;
}

export function NativeStepper({
  steps,
  current,
  className,
  testID,
}: NativeStepperProps) {
  return (
    <View
      testID={testID ?? "native-stepper"}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: current + 1, min: 1, max: steps.length }}
      className={cn("w-full", className)}
    >
      <View className="flex-row items-center">
        {steps.map((s, i) => {
          const isCompleted = i < current;
          const isCurrent = i === current;
          return (
            <View key={i} className="flex-1 flex-row items-center">
              <View
                testID={testID ? `${testID}-dot-${i}` : undefined}
                accessibilityLabel={`Step ${i + 1}: ${s.label}`}
                accessibilityState={{ selected: isCurrent }}
                className={cn(
                  "h-7 w-7 items-center justify-center rounded-full border",
                  isCompleted && "bg-primary border-primary",
                  isCurrent && "bg-background border-primary",
                  !isCompleted && !isCurrent && "bg-background border-border"
                )}
              >
                <Text
                  className={cn(
                    "text-xs font-semibold",
                    isCompleted && "text-primary-foreground",
                    isCurrent && "text-primary",
                    !isCompleted && !isCurrent && "text-muted-foreground"
                  )}
                >
                  {i + 1}
                </Text>
              </View>
              {i < steps.length - 1 ? (
                <View
                  className={cn(
                    "mx-1 h-0.5 flex-1",
                    isCompleted ? "bg-primary" : "bg-border"
                  )}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <View className="mt-2 flex-row">
        {steps.map((s, i) => (
          <View key={i} className="flex-1 px-1">
            <Text
              className={cn(
                "text-center text-xs",
                i === current ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
              numberOfLines={1}
            >
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
