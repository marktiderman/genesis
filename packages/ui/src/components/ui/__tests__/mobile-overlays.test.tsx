// @feat:ui-primitives
/**
 * The phone contract for overlays (docs/MOBILE.md). jsdom has no layout, so these check the
 * classes that carry each promise:
 *
 * - every overlay scrolls inside itself, so its actions can always be reached;
 * - dialogs and sheets pad clear of the notch and the home indicator;
 * - the close button is a 44px target;
 * - nothing animates when the person has asked for reduced motion.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "../alert-dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "../sheet";

function classesOf(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/);
}

describe("DialogContent on a phone", () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof DialogContent>> = {}) {
    // One dialog at a time, so a test can render each layout in turn.
    cleanup();
    render(
      <Dialog open>
        <DialogContent data-testid="content" {...props}>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    return screen.getByTestId("content");
  }

  it("stays the centred box by default, with side gutters and today's square corners", () => {
    const el = renderDialog();
    const cls = classesOf(el);
    expect(el.getAttribute("data-mobile-layout")).toBe("center");
    expect(cls).toContain("left-[50%]");
    expect(cls).toContain("top-[50%]");
    expect(cls).toContain("max-w-[calc(100%-2rem)]");
    expect(cls).toContain("data-[state=open]:slide-in-from-top-[48%]");
    // Not a sheet unless asked for.
    expect(cls).not.toContain("bottom-0");
    expect(cls).not.toContain("inset-x-0");
    expect(cls).not.toContain("rounded-t-xl");
    expect(cls).not.toContain("rounded-lg");
    expect(cls).toContain("sm:rounded-lg");
    expect(cls).toContain("motion-reduce:animate-none");
  });

  it("caps its height to the screen, clear of the safe areas, and scrolls inside", () => {
    const cls = classesOf(renderDialog());
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toContain("overscroll-contain");
    expect(cls).toContain(
      "max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]",
    );
    // No vh units, which a phone's toolbar cuts off.
    expect(cls.some((c) => /\d+vh\b/.test(c))).toBe(false);
  });

  it("keeps the centred box from sm up", () => {
    const cls = classesOf(renderDialog());
    expect(cls).toContain("left-[50%]");
    expect(cls).toContain("sm:max-w-lg");
    expect(cls).toContain("sm:max-h-[calc(100dvh-2rem)]");
    for (const layout of ["sheet", "fullscreen"] as const) {
      const moved = classesOf(renderDialog({ mobileLayout: layout }));
      expect(moved).toContain("sm:left-[50%]");
      expect(moved).toContain("sm:max-w-lg");
      expect(moved).toContain("sm:rounded-lg");
    }
  });

  it("lets a caller's plain padding and width win at every size, in every layout", () => {
    for (const layout of ["center", "sheet", "fullscreen"] as const) {
      const cls = classesOf(renderDialog({ mobileLayout: layout, className: "p-0 max-w-2xl" }));
      expect(cls).toContain("p-0");
      expect(cls.filter((c) => /^(sm:)?p[tb]?-/.test(c) && c !== "p-0")).toEqual([]);
      expect(cls).toContain("max-w-2xl");
      expect(cls.some((c) => c.startsWith("sm:") && c.includes("border"))).toBe(false);
    }
  });

  it("docks to the bottom as a sheet when asked, scrolling inside the safe areas", () => {
    const el = renderDialog({ mobileLayout: "sheet" });
    const cls = classesOf(el);
    expect(el.getAttribute("data-mobile-layout")).toBe("sheet");
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toContain("inset-x-0");
    expect(cls).toContain("bottom-0");
    expect(cls).toContain("rounded-t-xl");
    expect(cls).not.toContain("top-[50%]");
    expect(cls.some((c) => c.startsWith("max-h-[") && c.includes("safe-area-inset-top"))).toBe(true);
    expect(cls.some((c) => c.startsWith("pb-[") && c.includes("safe-area-inset-bottom"))).toBe(true);
    // The same centred box from sm up.
    expect(cls).toContain("sm:top-[50%]");
    expect(cls).toContain("sm:rounded-lg");
  });

  it("can fill the screen instead", () => {
    const el = renderDialog({ mobileLayout: "fullscreen" });
    const cls = classesOf(el);
    expect(cls).toContain("inset-0");
    expect(cls).toContain("h-[100dvh]");
    expect(cls.some((c) => c.startsWith("pt-[") && c.includes("safe-area-inset-top"))).toBe(true);
  });

  it("keeps the close button clear of the notch when full screen", () => {
    renderDialog({ mobileLayout: "fullscreen" });
    const cls = classesOf(screen.getByText("Close").closest("button"));
    expect(cls).toContain("top-[max(0.25rem,env(safe-area-inset-top))]");
    expect(cls).not.toContain("top-1");
  });

  it("gives the close button a 44px target", () => {
    renderDialog();
    const close = screen.getByText("Close").closest("button");
    expect(classesOf(close)).toContain("size-11");
  });
});

describe("AlertDialogContent on a phone", () => {
  it("keeps a gutter on each side and scrolls inside the screen", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent data-testid="alert">
          <AlertDialogTitle>Delete?</AlertDialogTitle>
          <AlertDialogDescription>It can't be undone.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const cls = classesOf(screen.getByTestId("alert"));
    expect(cls).toContain("max-w-[calc(100%-2rem)]");
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toContain("sm:rounded-lg");
    expect(cls).toContain("motion-reduce:animate-none");
  });
});

describe("SheetContent on a phone", () => {
  function renderSheet(side: "top" | "bottom" | "left" | "right") {
    render(
      <Sheet open>
        <SheetContent side={side} data-testid="sheet">
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>Body</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    return screen.getByTestId("sheet");
  }

  it.each(["top", "bottom", "left", "right"] as const)("%s sheet scrolls inside itself", (side) => {
    const cls = classesOf(renderSheet(side));
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toContain("motion-reduce:animate-none");
  });

  it("a bottom sheet is capped below the notch and padded above the home indicator", () => {
    const cls = classesOf(renderSheet("bottom"));
    expect(cls.some((c) => c.startsWith("max-h-[") && c.includes("safe-area-inset-top"))).toBe(true);
    expect(cls.some((c) => c.startsWith("pb-[") && c.includes("safe-area-inset-bottom"))).toBe(true);
  });

  it("a side sheet pads clear of the notch and the home indicator", () => {
    const cls = classesOf(renderSheet("right"));
    expect(cls.some((c) => c.startsWith("pt-[") && c.includes("safe-area-inset-top"))).toBe(true);
    expect(cls.some((c) => c.startsWith("pb-[") && c.includes("safe-area-inset-bottom"))).toBe(true);
  });

  it("gives the close button a 44px target", () => {
    renderSheet("right");
    expect(classesOf(screen.getByText("Close").closest("button"))).toContain("size-11");
  });
});
