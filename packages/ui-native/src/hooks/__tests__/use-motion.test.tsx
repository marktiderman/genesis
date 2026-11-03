import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";
import { MOTION_DURATIONS, MOTION_SPRINGS, resolveMotion } from "@marktiderman/genesis-design-system/tokens/motion";
import { animateMotion, motionSpring, motionTiming, useMotion } from "../use-motion";
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
    expect(R.withSpring).toHaveBeenCalledWith(0, { ...MOTION_SPRINGS.snappy, velocity: 800 });
  });

  it("times with the named duration and the token's curve", () => {
    const bezier = vi.fn(() => "curve");
    const fake = fakeReanimated();
    const R = { ...fake, Easing: { ...fake.Easing, bezier } };
    animateMotion(R, resolveMotion("calm"), 1, { duration: "fast", easing: "decelerate" });
    expect(bezier).toHaveBeenCalledWith(0.33, 1, 0.68, 1);
    expect(R.withTiming).toHaveBeenCalledWith(1, { duration: MOTION_DURATIONS.fast, easing: "curve" });
  });

  it("falls back to timing at base when the module has no withSpring", () => {
    const R = fakeReanimated();
    animateMotion(R, resolveMotion("calm"), 0, { spring: "smooth" });
    expect(R.withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: MOTION_DURATIONS.base }));
  });

  it("returns the final value, without animating, under reduced motion", () => {
    const R = { ...fakeReanimated(), withSpring: vi.fn((to: number) => to) };
    expect(animateMotion(R, resolveMotion("calm", { reducedMotion: true }), 42, { spring: "bouncy" })).toBe(42);
    expect(R.withSpring).not.toHaveBeenCalled();
    expect(R.withTiming).not.toHaveBeenCalled();
  });

  it("leaves velocity out when the gesture gave none", () => {
    const R = { ...fakeReanimated(), withSpring: vi.fn((to: number) => to) };
    animateMotion(R, resolveMotion("calm"), 0, { spring: "smooth" });
    expect((R.withSpring.mock.calls[0] as unknown[] | undefined)?.[1]).not.toHaveProperty("velocity");
  });
});

describe("worklet-safe configs", () => {
  it("builds a spring config, with velocity only when given", () => {
    const m = resolveMotion("calm");
    expect(motionSpring(m, "snappy")).toEqual(MOTION_SPRINGS.snappy);
    expect(motionSpring(m, "snappy", -300)).toEqual({ ...MOTION_SPRINGS.snappy, velocity: -300 });
  });

  it("settles at once, without the gesture's velocity, under reduced motion", () => {
    const still = motionSpring(resolveMotion("calm", { reducedMotion: true }), "bouncy", 900);
    expect(still).not.toHaveProperty("velocity");
    // Critically damped (no overshoot) and far stiffer than any named spring.
    expect(still.damping).toBeGreaterThanOrEqual(2 * Math.sqrt(still.stiffness * still.mass));
    expect(still.stiffness).toBeGreaterThan(MOTION_SPRINGS.snappy.stiffness * 10);
  });

  it("builds a timing config with the token's curve", () => {
    const m = resolveMotion("calm");
    const bezier = vi.fn(() => "curve");
    expect(motionTiming(m, "ui", { bezier }, "inOut")).toEqual({ duration: MOTION_DURATIONS.ui, easing: "curve" });
    expect(bezier).toHaveBeenCalledWith(0.65, 0, 0.35, 1);
    expect(motionTiming(m, "ui", undefined)).toEqual({ duration: MOTION_DURATIONS.ui });
  });

  it("zeroes durations under reduced motion", () => {
    expect(motionTiming(resolveMotion("none"), "ui", undefined)).toEqual({ duration: 0 });
  });
});
