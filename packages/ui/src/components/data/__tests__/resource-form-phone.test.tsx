// @feat:ui-primitives
/**
 * ResourceForm on a phone (below 768px) opens as a side sheet, as before. What the mobile patch
 * changes: the fields scroll inside the sheet and Save and Cancel stay pinned at its bottom,
 * above the home indicator, instead of sitting after a `60vh` box inside a sheet that scrolled
 * too. The sheet's width is not changed.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourceForm } from "../ResourceForm";
import type { ResourceFormFieldDef } from "../ResourceFormField";

const fields: ResourceFormFieldDef[] = [{ key: "name", label: "Name", type: "text" }];

function classesOf(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/);
}

function phoneViewport(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

function renderForm() {
  return render(
    <GenesisProvider provider={createMockProvider({ things: [] })}>
      <ResourceForm resource="things" action="create" open onOpenChange={() => {}} fields={fields} />
    </GenesisProvider>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("ResourceForm on a phone", () => {
  it("opens as a side sheet that keeps its width", async () => {
    phoneViewport(true);
    renderForm();
    await screen.findByLabelText(/Name/);
    const sheet = document.querySelector('[role="dialog"]');
    const cls = classesOf(sheet);
    expect(cls).toContain("right-0");
    expect(cls).toContain("w-3/4");
    expect(cls).not.toContain("w-full");
    // The sheet doesn't scroll itself; the fields do.
    expect(cls).toContain("flex-col");
  });

  it("scrolls the fields and pins Save and Cancel above the home indicator", async () => {
    phoneViewport(true);
    renderForm();
    const input = await screen.findByLabelText(/Name/);
    const scroller = input.closest(".overflow-y-auto");
    expect(classesOf(scroller)).toContain("flex-1");
    expect(classesOf(scroller).some((c) => /\d+vh\b/.test(c) || c.startsWith("max-h-["))).toBe(false);

    const footer = screen.getByRole("button", { name: /cancel/i }).parentElement;
    const footerCls = classesOf(footer);
    expect(footerCls.some((c) => c.startsWith("pb-[") && c.includes("safe-area-inset-bottom"))).toBe(true);
    // The buttons sit outside the scrolling box, so they can't scroll away.
    expect(scroller?.contains(footer ?? null)).toBe(false);
  });

  it("keeps the dialog layout on a desktop, its fields capped in dvh", async () => {
    phoneViewport(false);
    renderForm();
    const input = await screen.findByLabelText(/Name/);
    expect(classesOf(input.closest(".overflow-y-auto"))).toContain("max-h-[60dvh]");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("data-mobile-layout")).toBe("center");
  });
});
