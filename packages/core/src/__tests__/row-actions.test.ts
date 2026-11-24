// @feat:row-actions
import { describe, expect, it } from "vitest";
import { ROW_ACTION_ACCENTS, ROW_ACTION_TONES, rowActionLabel, rowActionPlaced, rowActionSwipe, rowActionTone, type RowSwipeAction } from "../row-actions";
import type { InboxSwipeAction } from "../conversation";

describe("row actions (core, ADR 0028)", () => {
  it("places an action from `swipe`, else the deprecated `side`, else trailing", () => {
    expect(rowActionSwipe({ swipe: { side: "leading", full: true } })).toEqual({ side: "leading", full: true });
    expect(rowActionSwipe({ swipe: false, side: "leading" })).toBe(false);
    expect(rowActionSwipe({ side: "leading" })).toEqual({ side: "leading" });
    expect(rowActionSwipe({})).toEqual({ side: "trailing" });
    expect(rowActionPlaced({})).toBe(false);
    expect(rowActionPlaced({ side: "trailing" })).toBe(true);
    expect(rowActionPlaced({ swipe: false })).toBe(true);
  });

  it("gives a tone from meaning: danger when destructive, else tint", () => {
    expect(rowActionTone({})).toBe("tint");
    expect(rowActionTone({ destructive: true })).toBe("danger");
    expect(rowActionTone({ destructive: true, tone: "warning" })).toBe("warning");
    expect(ROW_ACTION_TONES).toEqual(["tint", "danger", "success", "warning", "info", "neutral"]);
  });

  it("names the system colors Messages' row actions use, purple and orange apart", () => {
    for (const accent of ["blue", "orange", "purple", "red"] as const) expect(ROW_ACTION_ACCENTS).toContain(accent);
  });

  it("reads a refusal's reason into the screen reader's label, once", () => {
    expect(rowActionLabel({ label: "Delete" })).toBe("Delete");
    expect(rowActionLabel({ label: "Delete", reason: "The default brand stays." })).toBe("Delete: The default brand stays.");
  });

  it("is the inbox's InboxSwipeAction", () => {
    const action: RowSwipeAction = { id: "a", label: "A", onPress: () => undefined, swipe: { side: "leading" }, accent: "purple" };
    const inbox: InboxSwipeAction = action;
    expect(inbox.accent).toBe("purple");
  });
});
