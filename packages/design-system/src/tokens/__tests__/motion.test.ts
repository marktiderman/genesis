import { describe, expect, it } from "vitest";
import { MOTION_DURATIONS, MOTION_SPRINGS, cubicBezierCss, motionCssVariables, resolveMotion } from "../motion";
import { designSystemTheme } from "../../design-systems/tokens";
import { crispDesignSystem } from "../../design-systems/built-in";

describe("resolveMotion", () => {
  it("moves at every level but none", () => {
    for (const level of ["calm", "lively", "bold"] as const) {
      const m = resolveMotion(level);
      expect(m.reduced).toBe(false);
      expect(m.level).toBe(level);
      expect(m.duration).toEqual(MOTION_DURATIONS);
      expect(m.spring).toEqual(MOTION_SPRINGS);
    }
  });

  it("makes everything instant at level none, keeping a hover's colour change", () => {
    const m = resolveMotion("none");
    expect(m.reduced).toBe(true);
    const { hover, ...moving } = m.duration;
    expect(Object.values(moving).every((d) => d === 0)).toBe(true);
    expect(hover).toBe(MOTION_DURATIONS.hover);
  });

  it("settles springs at once, without overshoot, when nothing should move", () => {
    const { spring } = resolveMotion("none");
    for (const s of Object.values(spring)) {
      expect(s.damping).toBeGreaterThanOrEqual(2 * Math.sqrt(s.stiffness * s.mass));
      expect(s.stiffness).toBeGreaterThan(MOTION_SPRINGS.snappy.stiffness);
    }
    expect(resolveMotion("calm").spring).toEqual(MOTION_SPRINGS);
  });

  it("treats the OS's reduced motion as level none, whatever the level", () => {
    const m = resolveMotion("bold", { reducedMotion: true });
    expect(m).toEqual(resolveMotion("none"));
  });

  it("defaults to calm", () => {
    expect(resolveMotion().level).toBe("calm");
  });

  it("is frozen, so no caller can change another's motion", () => {
    expect(Object.isFrozen(MOTION_DURATIONS)).toBe(true);
    expect(Object.isFrozen(MOTION_SPRINGS.snappy)).toBe(true);
  });
});

describe("motion CSS", () => {
  it("writes a Bézier as cubic-bezier()", () => {
    expect(cubicBezierCss([0.22, 1, 0.36, 1])).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  });

  it("keeps the variables design systems already emitted, with the same values", () => {
    const v = motionCssVariables("calm");
    expect(v).toMatchObject({
      "--ds-ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
      "--ds-ease-swift": "cubic-bezier(0.2, 0.75, 0.5, 1)",
      "--ds-ease-in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
      "--ds-dur-press": "120ms",
      "--ds-dur-hover": "200ms",
      "--ds-dur-ui": "320ms",
      "--ds-dur-reveal": "700ms",
      "--ds-dur-media": "1100ms",
    });
    expect(motionCssVariables("none")).toMatchObject({ "--ds-dur-press": "0ms", "--ds-dur-hover": "200ms", "--ds-dur-ui": "0ms" });
  });

  it("is what a design system with motion emits", () => {
    const ds = crispDesignSystem;
    expect(ds.motion).toBeDefined();
    const theme = designSystemTheme(ds, { choices: { density: "normal", corners: "crisp", motion: "lively" } });
    expect(theme.variables.light).toMatchObject(motionCssVariables("lively"));
  });
});
