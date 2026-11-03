import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";
import { MOTION_DURATIONS, MOTION_SPRINGS, resolveMotion } from "@marktiderman/genesis-design-system/tokens/motion";
import { animateMotion, useMotion } from "../use-motion";
import { __resetReducedMotion } from "../use-reduced-motion";
import { fakeReanimated } from "../../__tests__/fake-modules";

afterEach(() => {
  vi.restoreAllMocks();
  __resetReducedMotion();
});

describe("useMotion", () => {
  it("gives the shared tokens at calm by default", () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    const { result } = renderHook(() => useMotion());
    expect(result.current.reduced).toBe(false);
    expect(result.current.duration).toEqual(MOTION_DURATIONS);
  });

  it("holds still when the OS asks for reduced motion", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const { result } = renderHook(() => useMotion({ level: "bold" }));
    await waitFor(() => expect(result.current.reduced).toBe(true));
    expect(result.current.duration.ui).toBe(0);
  });

  it("holds still at level none", () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    const { result } = renderHook(() => useMotion({ level: "none" }));
    expect(result.current.reduced).toBe(true);
  });
});

describe("animateMotion", () => {
  it("springs with the named spring and the gesture's velocity", () => {
    const R = { ...fakeReanimated(), withSpring: vi.fn((to: number) => to) };
    animateMotion(R, resolveMotion("calm"), 0, { spring: "snappy", velocity: 800 });
    expect(R.withSpring).toHaveBeenCalledWith(0, { ...MOTION_SPRINGS.snappy, velocity: 800 }, undefined);
  });

  it("times with the named duration and easing", () => {
    const bezier = vi.fn(() => "curve");
    const fake = fakeReanimated();
    const R = { ...fake, Easing: { ...fake.Easing, bezier } };
    animateMotion(R, resolveMotion("calm"), 1, { duration: "fast", easing: "decelerate" });
    expect(bezier).toHaveBeenCalledWith(0.33, 1, 0.68, 1);
    expect(R.withTiming).toHaveBeenCalledWith(1, { duration: MOTION_DURATIONS.fast, easing: "curve" }, undefined);
  });

  it("falls back to timing at base when the module has no withSpring", () => {
    const R = fakeReanimated();
    animateMotion(R, resolveMotion("calm"), 0, { spring: "smooth" });
    expect(R.withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: MOTION_DURATIONS.base }), undefined);
  });

  it("returns the final value, without animating, under reduced motion", () => {
    const R = { ...fakeReanimated(), withSpring: vi.fn((to: number) => to) };
    const done = vi.fn();
    expect(animateMotion(R, resolveMotion("calm", { reducedMotion: true }), 42, { spring: "bouncy" }, done)).toBe(42);
    expect(R.withSpring).not.toHaveBeenCalled();
    expect(R.withTiming).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith(true);
  });
});
