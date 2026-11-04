import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AccessibilityInfo, Animated } from "react-native";
import { GenesisModulesProvider } from "../../native-modules";
import { playHaptic, useHaptics, type GenesisHapticsModule } from "../use-haptics";
import { usePressFeedback } from "../use-press-feedback";
import { __resetReducedMotion } from "../use-reduced-motion";

function fakeHaptics(overrides: Partial<GenesisHapticsModule> = {}) {
  return {
    impactAsync: vi.fn(() => Promise.resolve()),
    selectionAsync: vi.fn(() => Promise.resolve()),
    notificationAsync: vi.fn(() => Promise.resolve()),
    ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
    NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
    ...overrides,
  };
}

const withHaptics = (haptics: GenesisHapticsModule) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <GenesisModulesProvider modules={{ haptics }}>{children}</GenesisModulesProvider>;
  };

afterEach(() => {
  vi.restoreAllMocks();
  __resetReducedMotion();
});

describe("playHaptic", () => {
  it.each([
    ["light", "impactAsync", "light"],
    ["medium", "impactAsync", "medium"],
    ["heavy", "impactAsync", "heavy"],
    ["success", "notificationAsync", "success"],
    ["warning", "notificationAsync", "warning"],
    ["error", "notificationAsync", "error"],
  ] as const)("plays %s through %s", (kind, method, style) => {
    const h = fakeHaptics();
    playHaptic(h, kind);
    expect(h[method]).toHaveBeenCalledWith(style);
  });

  it("plays select as a selection tick", () => {
    const h = fakeHaptics();
    playHaptic(h, "select");
    expect(h.selectionAsync).toHaveBeenCalled();
  });

  it("falls back to medium when the module has no heavy style", () => {
    const h = fakeHaptics({ ImpactFeedbackStyle: { Light: "light", Medium: "medium" } });
    playHaptic(h, "heavy");
    expect(h.impactAsync).toHaveBeenCalledWith("medium");
  });

  it("does nothing without a module", () => {
    expect(() => playHaptic(undefined, "light")).not.toThrow();
  });

  it("never throws or rejects", async () => {
    const throws = fakeHaptics({ impactAsync: vi.fn(() => { throw new Error("no engine"); }) });
    expect(() => playHaptic(throws, "light")).not.toThrow();
    const rejects = fakeHaptics({ selectionAsync: vi.fn(() => Promise.reject(new Error("no engine"))) });
    playHaptic(rejects, "select");
    await act(async () => {});
  });
});

describe("useHaptics", () => {
  it("plays through the app's GenesisModules.haptics", () => {
    const h = fakeHaptics();
    const { result } = renderHook(() => useHaptics(), { wrapper: withHaptics(h) });
    result.current("success");
    expect(h.notificationAsync).toHaveBeenCalledWith("success");
  });

  it("is a no-op without the module", () => {
    const { result } = renderHook(() => useHaptics());
    expect(() => result.current("light")).not.toThrow();
  });
});

describe("usePressFeedback", () => {
  it("shrinks while held and plays its haptic only when the press counts", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    const timing = vi.spyOn(Animated, "timing");
    const spring = vi.spyOn(Animated, "spring");
    const h = fakeHaptics();
    const { result } = renderHook(() => usePressFeedback({ haptic: "light" }), { wrapper: withHaptics(h) });
    await act(async () => {});
    expect(result.current.style.transform).toHaveLength(1);
    result.current.onPressIn();
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0.97, useNativeDriver: true }));
    result.current.onPressOut();
    expect(spring).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, damping: 30, stiffness: 400 }));
    expect(h.impactAsync).not.toHaveBeenCalled();
    result.current.confirm();
    expect(h.impactAsync).toHaveBeenCalledWith("light");
  });

  it("ticks on press-in for select", () => {
    const h = fakeHaptics();
    const { result } = renderHook(() => usePressFeedback({ haptic: "select" }), { wrapper: withHaptics(h) });
    result.current.onPressIn();
    expect(h.selectionAsync).toHaveBeenCalledTimes(1);
    result.current.confirm();
    expect(h.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("dims instead of moving under Reduce Motion, and never springs", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const timing = vi.spyOn(Animated, "timing");
    const spring = vi.spyOn(Animated, "spring");
    const { result } = renderHook(() => usePressFeedback());
    await waitFor(() => expect(result.current.style.opacity).toBeDefined());
    expect(result.current.style.transform).toBeUndefined();
    result.current.onPressIn();
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: 0.6 }));
    result.current.onPressOut();
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: 1 }));
    expect(spring).not.toHaveBeenCalled();
  });

  it("gives no feedback when disabled", () => {
    const timing = vi.spyOn(Animated, "timing");
    const h = fakeHaptics();
    const { result } = renderHook(() => usePressFeedback({ haptic: "light", disabled: true }), { wrapper: withHaptics(h) });
    expect(result.current.style).toEqual({});
    result.current.onPressIn();
    result.current.confirm();
    expect(timing).not.toHaveBeenCalled();
    expect(h.impactAsync).not.toHaveBeenCalled();
  });
});

describe("usePressFeedback, disabled mid-press", () => {
  it("comes back to rest when disabled while held", () => {
    const { result, rerender } = renderHook(({ disabled }) => usePressFeedback({ disabled }), { initialProps: { disabled: false } });
    const value = result.current.style.transform?.[0]?.scale as unknown as { setValue: (v: number) => void };
    const reset = vi.spyOn(value, "setValue");
    result.current.onPressIn();
    rerender({ disabled: true });
    expect(reset).toHaveBeenCalledWith(1);
  });
});
