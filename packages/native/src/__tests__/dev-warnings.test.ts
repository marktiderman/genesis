// @feat:native-app-shell
/**
 * The known dependency warnings kept out of LogBox in development: the first warning makes React
 * Native 0.88 pin "Open debugger to view warnings." over the native tab bar, where it takes the
 * first tab tap (seen in the starter on the iOS simulator after a launch and after a link).
 */
import { describe, expect, it, vi } from "vitest";
import { KNOWN_DEPENDENCY_WARNINGS, ignoreKnownDependencyWarnings } from "../dev-warnings";

const matches = (text: string) => KNOWN_DEPENDENCY_WARNINGS.some((pattern) => pattern.test(text));

describe("known dependency warnings", () => {
  it("match React Native's ImageBackground deprecation that NativeWind's runtime sets off at start-up", () => {
    expect(
      matches(
        "ImageBackground is deprecated and will be removed in a future release. Use a View with an absolutely positioned Image instead. See https://reactnative.dev/docs/imagebackground",
      ),
    ).toBe(true);
  });

  it("leave every other warning visible, the app's own included", () => {
    expect(matches("InputAccessoryView is deprecated and will be removed in a future release.")).toBe(false);
    expect(matches("Each child in a list should have a unique key prop.")).toBe(false);
    expect(matches("Open debugger to view warnings.")).toBe(false);
  });

  it("are given to LogBox in development only", () => {
    const logBox = { ignoreLogs: vi.fn() };
    expect(ignoreKnownDependencyWarnings(logBox, false)).toBe(false);
    expect(logBox.ignoreLogs).not.toHaveBeenCalled();
    expect(ignoreKnownDependencyWarnings(undefined, true)).toBe(false);
    expect(ignoreKnownDependencyWarnings(logBox, true)).toBe(true);
    expect(logBox.ignoreLogs).toHaveBeenCalledWith(KNOWN_DEPENDENCY_WARNINGS);
  });
});
