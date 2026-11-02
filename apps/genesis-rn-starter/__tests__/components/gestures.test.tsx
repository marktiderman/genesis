// @feat:native-starter
/**
 * Gestures in Jest: Gesture Handler's mocks (`jestSetup.js`, from jest.config.js) and Reanimated's
 * test mode (`setUpTests()` in setup.ts, its resolver in resolver.js). A Pan gesture fires from
 * the test with `fireGestureHandler`, its worklets write a shared value, and the animated style
 * follows: no device, no UI thread, and no rewriting the component onto the JS thread to test it.
 */
import { describe, expect, it } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import { GestureDetector, GestureHandlerRootView, State, usePanGesture } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import Animated, { getAnimatedStyle, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

// Reanimated types its Jest helpers in index.native.d.ts; TypeScript reads the web stub, which takes nothing.
const animatedStyle = getAnimatedStyle as unknown as (element: unknown) => unknown;

/** A card dragged sideways: the offset lives in a shared value, the drop is reported to React. */
function DraggableCard() {
  const offset = useSharedValue(0);
  const [dropped, setDropped] = useState<number | null>(null);
  const pan = usePanGesture({
    testID: "card-pan",
    onUpdate: (event) => {
      "worklet";
      offset.value = event.translationX;
    },
    onDeactivate: () => {
      "worklet";
      scheduleOnRN(setDropped, offset.value);
    },
  });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    <GestureHandlerRootView>
      <GestureDetector gesture={pan}>
        <Animated.View testID="card" style={style}>
          <Text>{dropped === null ? "Drag me" : `Dropped at ${dropped}`}</Text>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

describe("gestures in Jest", () => {
  it("drives a Pan gesture's shared value and animated style from the test", async () => {
    await render(<DraggableCard />);
    expect(animatedStyle(screen.getByTestId("card"))).toEqual({ transform: [{ translateX: 0 }] });

    await act(async () => {
      fireGestureHandler(getByGestureTestId("card-pan"), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 40 },
        { translationX: 120 },
        { state: State.END, translationX: 120 },
      ]);
    });

    expect(animatedStyle(screen.getByTestId("card"))).toEqual({ transform: [{ translateX: 120 }] });
    expect(await screen.findByText("Dropped at 120")).toBeOnTheScreen();
  });
});
