// @feat:chat
import { describe, expect, it } from "vitest";
import { chatThreadStackOptions } from "../stack-options";
import { barsThatFit, waveformBars } from "../voice-player";

describe("chatThreadStackOptions", () => {
  it("keeps the bar opaque, so the inverted list never sits under iOS's see-through bar", () => {
    const opts = chatThreadStackOptions({ headerTitle: "Lin" }, "#f2f2f7");
    expect(opts).toMatchObject({ title: "Lin", headerTransparent: false, headerStyle: { backgroundColor: "#f2f2f7" } });
    expect(opts.headerLargeTitle).toBeUndefined();
  });

  it("never turns on a large title, which would collapse into the flipped list", () => {
    expect(chatThreadStackOptions({ headerTitle: "Lin", large: true }, "#fff").headerLargeTitle).toBeUndefined();
  });

  it("lets the app's own header options win", () => {
    const opts = chatThreadStackOptions({ headerTitle: "Lin", headerOptions: { headerStyle: { backgroundColor: "red" } } }, "#fff");
    expect(opts.headerStyle).toEqual({ backgroundColor: "red" });
  });
});

describe("barsThatFit", () => {
  it("fits one 3-point bar and a 2-point gap each across the width", () => {
    expect(barsThatFit(98)).toBe(20);
    expect(barsThatFit(3)).toBe(1);
  });

  it("draws one bar before the width is known", () => {
    expect(barsThatFit(0)).toBe(1);
    expect(barsThatFit(Number.NaN)).toBe(1);
  });

  it("never asks for more bars than the slot holds", () => {
    for (const width of [40, 78, 98, 140]) {
      const n = barsThatFit(width);
      expect(n * 3 + (n - 1) * 2).toBeLessThanOrEqual(width);
      expect(waveformBars([10, 50, 90], n)).toHaveLength(n);
    }
  });
});
