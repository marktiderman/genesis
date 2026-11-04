import { describe, expect, it } from "vitest";
import { splitTabBarItems, TAB_BAR_MAX } from "../navigation";

describe("splitTabBarItems", () => {
  it("shows up to five, then four and More", () => {
    expect(TAB_BAR_MAX).toBe(5);
    expect(splitTabBarItems([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3, 4, 5], more: [] });
    expect(splitTabBarItems([1, 2, 3, 4, 5, 6, 7])).toEqual({ shown: [1, 2, 3, 4], more: [5, 6, 7] });
  });

  it("honours a smaller max and never drops below one slot", () => {
    expect(splitTabBarItems([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2], more: [3, 4] });
    expect(splitTabBarItems([1, 2], 0)).toEqual({ shown: [], more: [1, 2] });
  });
});
